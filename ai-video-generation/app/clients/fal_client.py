import asyncio
from app.config import settings


class FalClient:
    async def flux(self, prompt: str, image_size: str = "landscape_16_9") -> str:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.run,
            "fal-ai/flux-pro/v1.1-ultra",
            arguments={
                "prompt": prompt,
                "image_size": image_size,
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
                "num_images": 1,
                "output_format": "jpeg",
            },
        )
        return result["images"][0]["url"]

    async def instant_id(self, face_url: str, prompt: str) -> str:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.run,
            "fal-ai/instantid",
            arguments={
                "face_image_url": face_url,
                "prompt": prompt,
                "negative_prompt": "blurry, low quality, deformed, watermark",
                "num_inference_steps": 30,
                "guidance_scale": 5.0,
            },
        )
        return result["images"][0]["url"]

    async def kling_image_to_video(self, image_url: str, prompt: str,
                                   duration: str = "5") -> str:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/kling-video/v2/master/image-to-video",
            arguments={
                "image_url": image_url,
                "prompt": prompt,
                "negative_prompt": "blurry, shaky, artifacts",
                "duration": duration,
                "aspect_ratio": "16:9",
                "cfg_scale": 0.5,
            },
        )
        return result["video"]["url"]

    async def wan_image_to_video(self, image_url: str, prompt: str) -> str:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/wan/v2.1/image-to-video",
            arguments={
                "image_url": image_url,
                "prompt": prompt,
                "num_frames": 81,
                "sample_steps": 30,
                "guide_scale": 5.0,
            },
        )
        return result["video"]["url"]

    async def music_gen(self, prompt: str, duration: int = 35) -> str:
        import fal_client
        result = await asyncio.to_thread(
            fal_client.run,
            "fal-ai/stable-audio",
            arguments={"prompt": prompt, "seconds_total": duration},
        )
        return result["audio_file"]["url"]
