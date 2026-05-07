import asyncio
from typing import AsyncGenerator
from app.pipeline.state import PipelineState, GeneratedImage, VideoChunk, AudioResult
from app.pipeline.agents.prompt_agent import PromptAgent
from app.pipeline.agents.image_agent import ImageAgent
from app.pipeline.agents.video_agent import VideoAgent
from app.pipeline.agents.audio_agent import AudioAgent
from app.pipeline.agents.selector_agent import SelectorAgent
from app.pipeline.agents.assembly_agent import AssemblyAgent
from app.utils.cost_tracker import CostTracker


def _initial_state(job_id: str, prompt: str, product_image_keys: list[str],
                   face_image_keys: list[str], n_chunks: int = 5, chunk_duration: int = 6,
                   language: str = "vi", tone: str = "professional",
                   video_model: str = "kling-v2-5-turbo") -> PipelineState:
    return PipelineState(
        job_id=job_id,
        prompt=prompt,
        product_image_keys=product_image_keys,
        face_image_keys=face_image_keys,
        n_chunks=n_chunks,
        chunk_duration=chunk_duration,
        language=language,
        tone=tone,
        video_model=video_model,
        prompt_plan=None,
        generated_images=[],
        video_chunks=[],
        selected_chunks=[],
        audio_result=None,
        final_video_key=None,
        cost_usd=0.0,
        error=None,
        phase="init",
    )


class Pipeline:
    def __init__(self):
        self.prompt_agent = PromptAgent()
        self.image_agent = ImageAgent()
        self.video_agent = VideoAgent()
        self.audio_agent = AudioAgent()
        self.selector_agent = SelectorAgent()
        self.assembly_agent = AssemblyAgent()

    async def run(self, state: PipelineState,
                  on_progress=None) -> PipelineState:
        cost = CostTracker()

        async def update(phase: str, pct: int):
            state["phase"] = phase
            state["cost_usd"] = cost.total
            if on_progress:
                await on_progress(phase, pct, cost.total)

        try:
            await update("script", 5)
            state = await self.prompt_agent.run(state, cost)

            await update("images", 10)
            state = await self.image_agent.run(state, cost)

            # Video and audio run concurrently; pass copies to avoid shared-state mutation
            await update("video", 35)
            import copy
            audio_state_copy = copy.copy(state)
            video_task = asyncio.create_task(self.video_agent.run(state, cost))
            audio_task = asyncio.create_task(self.audio_agent.run(audio_state_copy, cost))

            video_state, audio_state = await asyncio.gather(video_task, audio_task)
            state = video_state
            state["audio_result"] = audio_state.get("audio_result")

            await update("selection", 75)
            state = await self.selector_agent.run(state, cost)

            await update("assembly", 85)
            state = await self.assembly_agent.run(state, cost)

            state["cost_usd"] = cost.total
            await update("done", 100)

        except Exception as exc:
            state["error"] = str(exc)
            state["phase"] = "failed"
            raise

        return state


async def run_pipeline(job_id: str, prompt: str, product_image_keys: list[str],
                        face_image_keys: list[str], n_chunks: int = 5,
                        chunk_duration: int = 6, language: str = "vi",
                        tone: str = "professional", video_model: str = "kling-v2-5-turbo",
                        on_progress=None) -> PipelineState:
    state = _initial_state(
        job_id=job_id,
        prompt=prompt,
        product_image_keys=product_image_keys,
        face_image_keys=face_image_keys,
        n_chunks=n_chunks,
        chunk_duration=chunk_duration,
        language=language,
        tone=tone,
        video_model=video_model,
    )
    pipeline = Pipeline()
    return await pipeline.run(state, on_progress=on_progress)
