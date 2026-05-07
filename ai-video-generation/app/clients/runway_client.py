import asyncio
from app.config import settings


class RunwayClient:
    async def image_to_video(self, image_url: str, prompt: str, duration: int = 5) -> str:
        from runwayml import RunwayML
        client = RunwayML(api_key=settings.runwayml_api_secret)

        task = await asyncio.to_thread(
            client.image_to_video.create,
            model="gen4_turbo",
            prompt_image=image_url,
            prompt_text=prompt,
            duration=duration,
            ratio="1280:720",
        )
        for _ in range(120):
            await asyncio.sleep(5)
            task = await asyncio.to_thread(client.tasks.retrieve, task.id)
            if task.status == "SUCCEEDED":
                return task.output[0]
            if task.status == "FAILED":
                raise RuntimeError(f"Runway failed: {task.failure_code}")
        raise TimeoutError("Runway task timed out")
