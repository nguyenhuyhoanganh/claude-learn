import asyncio
from celery import Celery, chord, group
from app.config import settings

celery_app = Celery(
    "video_gen",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.pipeline.tasks.run_pipeline_task": {"queue": "pipeline_queue"},
        "app.pipeline.tasks.generate_video_chunk_task": {"queue": "video_queue"},
        "app.pipeline.tasks.assemble_video_task": {"queue": "assembly_queue"},
    },
)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=15,
    queue="pipeline_queue",
    name="app.pipeline.tasks.run_pipeline_task",
)
def run_pipeline_task(
    self,
    job_id: str,
    prompt: str,
    product_image_keys: list,
    face_image_keys: list,
    n_chunks: int = 5,
    chunk_duration: int = 6,
    language: str = "vi",
    tone: str = "professional",
    video_model: str = "kling-v2-5-turbo",
):
    from app.pipeline.orchestrator import run_pipeline
    from app.services.job_service import JobService
    from app.database import async_session_factory

    async def _run():
        async with async_session_factory() as db:
            job_svc = JobService(db)

            async def on_progress(phase: str, pct: int, cost: float):
                await job_svc.update_progress(job_id, phase, pct, cost)

            state = await run_pipeline(
                job_id=job_id,
                prompt=prompt,
                product_image_keys=product_image_keys,
                face_image_keys=face_image_keys,
                n_chunks=n_chunks,
                chunk_duration=chunk_duration,
                language=language,
                tone=tone,
                video_model=video_model,
                on_progress=on_progress,
            )

            if state.get("error"):
                await job_svc.fail_job(job_id, state["error"])
            else:
                await job_svc.complete_job(
                    job_id,
                    final_video_key=state["final_video_key"],
                    cost_usd=state["cost_usd"],
                )

        return state

    try:
        return asyncio.run(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 15)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=15,
    queue="video_queue",
    name="app.pipeline.tasks.generate_video_chunk_task",
)
def generate_video_chunk_task(
    self,
    job_id: str,
    chunk_id: int,
    prompt: str,
    image_url: str,
    model: str = "kling-v2-5-turbo",
    duration: int = 5,
):
    """Used for standalone parallel chunk generation outside the main pipeline."""
    from app.pipeline.agents.video_agent import VideoAgent
    from app.pipeline.state import GeneratedImage

    agent = VideoAgent()

    async def _run():
        from app.utils.cost_tracker import CostTracker
        cost = CostTracker()
        img = GeneratedImage(url=image_url, storage_key="", scene_index=chunk_id)
        chunk = await agent._generate_chunk(
            chunk_id=chunk_id,
            image=img,
            prompt=prompt,
            duration=duration,
            model=model,
            cost_tracker=cost,
        )
        return {
            "chunk_id": chunk.chunk_id,
            "storage_key": chunk.storage_key,
            "duration": chunk.duration,
            "quality_score": chunk.quality_score,
        }

    try:
        return asyncio.run(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 15)


@celery_app.task(
    queue="assembly_queue",
    name="app.pipeline.tasks.assemble_video_task",
)
def assemble_video_task(chunk_results: list, job_id: str):
    """Chord callback: called after all parallel video chunks complete."""
    from app.pipeline.agents.assembly_agent import AssemblyAgent
    from app.pipeline.state import VideoChunk

    async def _run():
        from app.utils.cost_tracker import CostTracker
        from app.pipeline.state import PipelineState
        cost = CostTracker()

        chunks = [
            VideoChunk(
                chunk_id=r["chunk_id"],
                scene_index=r["chunk_id"],
                url="",
                storage_key=r["storage_key"],
                duration=r["duration"],
                quality_score=r.get("quality_score", 80.0),
            )
            for r in chunk_results if r
        ]

        state = PipelineState(
            job_id=job_id,
            prompt="",
            product_image_keys=[],
            face_image_keys=[],
            n_chunks=len(chunks),
            chunk_duration=5,
            language="vi",
            tone="professional",
            video_model="kling",
            prompt_plan=None,
            generated_images=[],
            video_chunks=chunks,
            selected_chunks=chunks,
            audio_result=None,
            final_video_key=None,
            cost_usd=0.0,
            error=None,
            phase="assembly",
        )

        agent = AssemblyAgent()
        state = await agent.run(state, cost)
        return {"final_video_key": state.get("final_video_key")}

    return asyncio.run(_run())


def dispatch_parallel_video_generation(job_id: str, chunk_specs: list[dict]) -> object:
    """Dispatch N video chunks in parallel, then assemble when all done."""
    tasks = group(
        generate_video_chunk_task.s(
            job_id=job_id,
            chunk_id=spec["chunk_id"],
            prompt=spec["prompt"],
            image_url=spec["image_url"],
            model=spec.get("model", "kling-v2-5-turbo"),
            duration=spec.get("duration", 5),
        )
        for spec in chunk_specs
    )
    return chord(tasks)(assemble_video_task.s(job_id=job_id))
