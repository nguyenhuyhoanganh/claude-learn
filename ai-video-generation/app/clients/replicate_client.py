import asyncio


class ReplicateClient:
    async def idm_vton(self, person_url: str, garment_url: str,
                        garment_desc: str = "product") -> str:
        import replicate
        output = await asyncio.to_thread(
            replicate.run,
            "cuuupid/idm-vton",
            input={
                "human_img": person_url,
                "garm_img": garment_url,
                "garment_des": garment_desc,
                "is_checked": True,
                "denoise_steps": 30,
                "seed": 42,
            },
        )
        return output[0] if isinstance(output, list) else str(output)

    async def wan_image_to_video(self, image_url: str, prompt: str) -> str:
        import replicate
        output = await asyncio.to_thread(
            replicate.run,
            "wavespeedai/wan-2.1-i2v-480p",
            input={
                "image": image_url,
                "prompt": prompt,
                "num_frames": 81,
                "sample_steps": 30,
                "guide_scale": 5.0,
            },
        )
        return str(output)

    async def music_gen(self, prompt: str, duration: int = 30) -> str:
        import replicate
        output = await asyncio.to_thread(
            replicate.run,
            "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043399421d6d8962a21ef248b3ba",
            input={
                "prompt": prompt,
                "model_version": "stereo-large",
                "output_format": "mp3",
                "duration": duration,
            },
        )
        return str(output)
