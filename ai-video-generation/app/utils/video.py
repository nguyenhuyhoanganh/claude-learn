import asyncio
import subprocess
import tempfile
from pathlib import Path


async def run_ffmpeg(*args: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {stderr.decode()[-500:]}")


async def extract_last_frame(video_path: str, output_path: str) -> str:
    await run_ffmpeg(
        "-sseof", "-0.1",
        "-i", video_path,
        "-frames:v", "1",
        "-q:v", "2",
        output_path,
    )
    return output_path


async def concat_videos(video_paths: list[str], output_path: str, crossfade_sec: float = 0.5) -> str:
    if len(video_paths) == 1:
        import shutil
        shutil.copy(video_paths[0], output_path)
        return output_path

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        for p in video_paths:
            f.write(f"file '{p}'\n")
        list_file = f.name

    if crossfade_sec <= 0:
        await run_ffmpeg(
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            output_path,
        )
    else:
        # xfade filter for smooth transitions
        n = len(video_paths)
        filter_parts = []
        inputs = "".join(f"[{i}:v]" for i in range(n))
        offset = 0.0
        prev = "[0:v]"

        for i in range(1, n):
            out_label = f"[v{i}]" if i < n - 1 else "[vout]"
            dur_cmd = ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                       "-of", "csv=p=0", video_paths[i - 1]]
            dur_result = subprocess.run(dur_cmd, capture_output=True, text=True)
            try:
                dur = float(dur_result.stdout.strip())
            except ValueError:
                dur = 5.0
            offset += dur - crossfade_sec
            filter_parts.append(
                f"{prev}[{i}:v]xfade=transition=fade:duration={crossfade_sec}:offset={offset}{out_label}"
            )
            prev = out_label

        filter_str = ";".join(filter_parts)
        input_args = []
        for p in video_paths:
            input_args += ["-i", p]

        await run_ffmpeg(
            *input_args,
            "-filter_complex", filter_str,
            "-map", "[vout]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            output_path,
        )

    return output_path


async def mix_audio(video_path: str, speech_path: str, music_path: str | None,
                    output_path: str, music_volume: float = 0.15) -> str:
    if music_path:
        filter_complex = (
            f"[1:a]volume=1.0[speech];"
            f"[2:a]volume={music_volume},aloop=loop=-1:size=2e+09[music];"
            f"[speech][music]amix=inputs=2:duration=first[aout]"
        )
        await run_ffmpeg(
            "-i", video_path,
            "-i", speech_path,
            "-i", music_path,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            output_path,
        )
    else:
        await run_ffmpeg(
            "-i", video_path,
            "-i", speech_path,
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            output_path,
        )
    return output_path


async def apply_color_grade(input_path: str, output_path: str, lut_path: str | None = None) -> str:
    if lut_path:
        await run_ffmpeg(
            "-i", input_path,
            "-vf", f"lut3d={lut_path}",
            "-c:a", "copy",
            output_path,
        )
    else:
        # Subtle S-curve color grade
        await run_ffmpeg(
            "-i", input_path,
            "-vf", "curves=r='0/0 0.25/0.20 0.75/0.80 1/1':g='0/0 0.25/0.22 0.75/0.78 1/1':b='0/0 0.25/0.22 0.75/0.78 1/1'",
            "-c:a", "copy",
            output_path,
        )
    return output_path


async def export_formats(input_path: str, output_dir: str, base_name: str) -> dict[str, str]:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    outputs: dict[str, str] = {}

    formats = {
        "16x9": ("1280:720", f"{output_dir}/{base_name}_16x9.mp4"),
        "9x16": ("720:1280", f"{output_dir}/{base_name}_9x16.mp4"),
        "1x1": ("720:720", f"{output_dir}/{base_name}_1x1.mp4"),
    }

    for fmt, (size, out_path) in formats.items():
        w, h = size.split(":")
        await run_ffmpeg(
            "-i", input_path,
            "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
            "-c:a", "copy",
            out_path,
        )
        outputs[fmt] = out_path

    return outputs


async def get_video_duration(video_path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        video_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(stdout.decode().strip())
    except ValueError:
        return 0.0


def generate_mock_video(output_path: str, duration: int = 5, width: int = 1280, height: int = 720) -> str:
    """Generate a solid-color test video without any API calls."""
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=blue:size={width}x{height}:duration={duration}:rate=24",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path
