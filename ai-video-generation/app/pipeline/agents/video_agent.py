import asyncio
import tempfile
from pathlib import Path
from app.config import settings
from app.pipeline.state import PipelineState, GeneratedImage, VideoChunk
from app.services.storage import StorageService
from app.clients.fal_client import FalClient
from app.clients.kling_client import KlingClient
from app.clients.runway_client import RunwayClient
from app.clients.replicate_client import ReplicateClient
from app.utils.video import generate_mock_video, get_video_duration
from app.utils.cost_tracker import CostTracker
import httpx

_storage = StorageService()
_fal = FalClient()
_kling = KlingClient()
_runway = RunwayClient()
_replicate = ReplicateClient()

_SEMAPHORE = asyncio.Semaphore(3)  # max 3 concurrent video API calls


class VideoAgent:
    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        images = state["generated_images"]
        plan = state["prompt_plan"]
        model = state.get("video_model") or settings.default_video_model

        if settings.mock:
            state["video_chunks"] = await self._mock_chunks(state, plan)
            return state

        tasks = [
            self._generate_chunk(
                chunk_id=scene.index,
                image=images[scene.index % len(images)],
                prompt=scene.video_prompt,
                duration=scene.duration,
                model=model,
                cost_tracker=cost_tracker,
            )
            for scene in plan.scenes
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        chunks: list[VideoChunk] = []
        for r in results:
            if isinstance(r, Exception):
                continue
            chunks.append(r)

        state["video_chunks"] = chunks
        return state

    async def _generate_chunk(self, chunk_id: int, image: GeneratedImage,
                               prompt: str, duration: int, model: str,
                               cost_tracker: CostTracker) -> VideoChunk:
        async with _SEMAPHORE:
            video_url = await self._call_video_api(image.url, prompt, duration, model)

        # Download and store
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.get(video_url)
            r.raise_for_status()
            video_data = r.content

        key = f"video_chunks/{chunk_id}.mp4"
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(video_data)
            tmp_path = f.name

        await _storage.upload_file(tmp_path, key, content_type="video/mp4")
        actual_duration = await get_video_duration(tmp_path)
        Path(tmp_path).unlink(missing_ok=True)

        rate_key = f"{model.replace('-', '_').replace('.', '_')}"
        cost_tracker.add_video(rate_key, actual_duration or duration)

        return VideoChunk(
            chunk_id=chunk_id,
            scene_index=chunk_id,
            url=video_url,
            storage_key=key,
            duration=actual_duration or duration,
            quality_score=80.0,  # default; selector_agent refines
            model=model,
        )

    async def _call_video_api(self, image_url: str, prompt: str, duration: int, model: str) -> str:
        if "runway" in model:
            return await _runway.image_to_video(image_url, prompt, duration=duration)
        elif "kling" in model:
            return await _kling.image_to_video(image_url, prompt, duration=str(duration), model=model)
        elif "wan" in model:
            return await _replicate.wan_image_to_video(image_url, prompt)
        else:
            # Default: fal.ai Kling
            return await _fal.kling_image_to_video(image_url, prompt, duration=str(duration))

    async def _mock_chunks(self, state: PipelineState, plan) -> list[VideoChunk]:
        chunks = []
        for scene in plan.scenes:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                tmp_path = f.name
            generate_mock_video(tmp_path, duration=scene.duration)
            key = f"video_chunks/mock_{scene.index}.mp4"
            await _storage.upload_file(tmp_path, key, content_type="video/mp4")
            url = await _storage.get_public_url(key)
            Path(tmp_path).unlink(missing_ok=True)
            chunks.append(VideoChunk(
                chunk_id=scene.index,
                scene_index=scene.index,
                url=url,
                storage_key=key,
                duration=float(scene.duration),
                quality_score=100.0,
                model="mock",
            ))
        return chunks
