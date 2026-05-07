import asyncio
import tempfile
from pathlib import Path
from app.config import settings
from app.pipeline.state import PipelineState, AudioResult
from app.services.storage import StorageService
from app.clients.elevenlabs_client import ElevenLabsClient, OpenAITTSClient
from app.clients.fal_client import FalClient
from app.clients.replicate_client import ReplicateClient
from app.utils.cost_tracker import CostTracker

_storage = StorageService()
_eleven = ElevenLabsClient()
_openai_tts = OpenAITTSClient()
_fal = FalClient()
_replicate = ReplicateClient()


class AudioAgent:
    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        plan = state["prompt_plan"]
        script = plan.narration_script
        language = plan.language
        tone = plan.tone

        voice_key = _pick_voice(language, tone)
        total_duration = sum(s.duration for s in plan.scenes)
        music_prompt = f"background music for product advertisement, {tone} tone, upbeat, no vocals"

        if settings.mock:
            state["audio_result"] = await self._mock_audio(script, total_duration)
            return state

        speech_task = self._generate_speech(script, voice_key, cost_tracker)
        music_task = self._generate_music(music_prompt, int(total_duration + 5), cost_tracker)

        speech_key, music_key = await asyncio.gather(speech_task, music_task)

        state["audio_result"] = AudioResult(
            speech_key=speech_key,
            music_key=music_key,
            duration=total_duration,
            script=script,
        )
        return state

    async def _generate_speech(self, script: str, voice_key: str,
                                cost_tracker: CostTracker) -> str:
        try:
            audio_data = await _eleven.tts(script, voice_key=voice_key)
            cost_tracker.add_tts("elevenlabs", len(script))
        except Exception:
            audio_data = await _openai_tts.tts(script, voice_key=voice_key)
            cost_tracker.add_tts("openai_tts", len(script))

        key = "audio/speech.mp3"
        await _storage.upload_bytes(audio_data, key, content_type="audio/mpeg")
        return key

    async def _generate_music(self, prompt: str, duration: int,
                               cost_tracker: CostTracker) -> str | None:
        try:
            if settings.fal_key:
                music_url = await _fal.music_gen(prompt, duration=duration)
            else:
                music_url = await _replicate.music_gen(prompt, duration=duration)
            cost_tracker.add_music(duration)

            import httpx
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.get(music_url)
                r.raise_for_status()
                music_data = r.content

            key = "audio/music.mp3"
            await _storage.upload_bytes(music_data, key, content_type="audio/mpeg")
            return key
        except Exception:
            return None

    async def _mock_audio(self, script: str, duration: float) -> AudioResult:
        import subprocess
        # Generate sine wave speech placeholder
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            speech_path = f.name
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"sine=frequency=440:duration={int(duration)}",
            "-acodec", "libmp3lame", speech_path,
        ], check=True, capture_output=True)
        speech_data = Path(speech_path).read_bytes()
        Path(speech_path).unlink(missing_ok=True)

        speech_key = "audio/mock_speech.mp3"
        await _storage.upload_bytes(speech_data, speech_key, content_type="audio/mpeg")

        return AudioResult(
            speech_key=speech_key,
            music_key=None,
            duration=duration,
            script=script,
        )


def _pick_voice(language: str, tone: str) -> str:
    if language.startswith("vi"):
        return "vi_male" if tone in ("authoritative", "serious") else "vi_female"
    return "en_female"
