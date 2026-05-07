import asyncio
import httpx
from app.config import settings


class KlingClient:
    BASE_URL = "https://api.klingai.com/v1"

    @property
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {settings.kling_api_key}"}

    async def image_to_video(self, image_url: str, prompt: str,
                              duration: str = "5", model: str = "kling-v2-5-turbo") -> str:
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                f"{self.BASE_URL}/videos/image2video",
                headers=self._headers,
                json={
                    "model_name": model,
                    "image": image_url,
                    "prompt": prompt,
                    "negative_prompt": "blurry, shaky, low quality",
                    "duration": duration,
                    "cfg_scale": 0.5,
                },
            )
            r.raise_for_status()
            task_id = r.json()["data"]["task_id"]

            for _ in range(120):
                await asyncio.sleep(5)
                status = await client.get(
                    f"{self.BASE_URL}/videos/image2video/{task_id}",
                    headers=self._headers,
                )
                data = status.json()["data"]
                if data["task_status"] == "succeed":
                    return data["task_result"]["videos"][0]["url"]
                if data["task_status"] == "failed":
                    raise RuntimeError(f"Kling failed: {data.get('task_status_msg')}")

        raise TimeoutError("Kling task timed out")
