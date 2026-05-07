import tempfile
from pathlib import Path
from app.config import settings
from app.pipeline.state import PipelineState
from app.services.storage import StorageService
from app.utils.video import (
    concat_videos, mix_audio, apply_color_grade,
    export_formats, generate_mock_video,
)
from app.utils.cost_tracker import CostTracker

_storage = StorageService()


class AssemblyAgent:
    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        chunks = state["selected_chunks"]
        audio = state.get("audio_result")
        job_id = state["job_id"]

        if not chunks:
            state["error"] = "No video chunks to assemble"
            return state

        if settings.mock:
            state["final_video_key"] = await self._mock_final(job_id)
            return state

        # Download all chunks to local temp files
        local_paths: list[str] = []
        try:
            for chunk in chunks:
                local = await _storage.download_to(chunk.storage_key)
                local_paths.append(local)

            # Concat with crossfade
            with tempfile.NamedTemporaryFile(suffix="_concat.mp4", delete=False) as f:
                concat_path = f.name
            await concat_videos(local_paths, concat_path, crossfade_sec=0.5)

            # Mix audio
            if audio:
                speech_local = await _storage.download_to(audio.speech_key)
                music_local = None
                if audio.music_key:
                    music_local = await _storage.download_to(audio.music_key)

                with tempfile.NamedTemporaryFile(suffix="_mixed.mp4", delete=False) as f:
                    mixed_path = f.name
                await mix_audio(concat_path, speech_local, music_local, mixed_path)
                Path(concat_path).unlink(missing_ok=True)
            else:
                mixed_path = concat_path

            # Color grade
            with tempfile.NamedTemporaryFile(suffix="_graded.mp4", delete=False) as f:
                graded_path = f.name
            await apply_color_grade(mixed_path, graded_path)
            Path(mixed_path).unlink(missing_ok=True)

            # Export all formats
            with tempfile.TemporaryDirectory() as export_dir:
                outputs = await export_formats(graded_path, export_dir, base_name=job_id)
                Path(graded_path).unlink(missing_ok=True)

                # Upload primary (16:9) as final
                primary_key = f"output/{job_id}_16x9.mp4"
                await _storage.upload_file(outputs["16x9"], primary_key, content_type="video/mp4")

                # Upload other formats
                for fmt, path in outputs.items():
                    if fmt != "16x9":
                        key = f"output/{job_id}_{fmt}.mp4"
                        await _storage.upload_file(path, key, content_type="video/mp4")

            state["final_video_key"] = primary_key

        finally:
            for p in local_paths:
                Path(p).unlink(missing_ok=True)

        return state

    async def _mock_final(self, job_id: str) -> str:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            tmp_path = f.name
        generate_mock_video(tmp_path, duration=20)
        key = f"output/{job_id}_mock.mp4"
        await _storage.upload_file(tmp_path, key, content_type="video/mp4")
        Path(tmp_path).unlink(missing_ok=True)
        return key
