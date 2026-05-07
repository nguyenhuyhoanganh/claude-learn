import asyncio
from app.config import settings
from app.pipeline.state import PipelineState, GeneratedImage, PromptPlan
from app.services.storage import StorageService
from app.clients.fal_client import FalClient
from app.clients.replicate_client import ReplicateClient
from app.utils.image import generate_placeholder_image, laplacian_variance, download_image
from app.utils.cost_tracker import CostTracker

_storage = StorageService()
_fal = FalClient()
_replicate = ReplicateClient()


class ImageAgent:
    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        plan: PromptPlan = state["prompt_plan"]

        if settings.mock:
            state["generated_images"] = await self._mock_images(state, plan)
            return state

        tasks = []
        # Generate scene images (one per scene using product images as reference)
        for i, scene in enumerate(plan.scenes):
            product_key = state["product_image_keys"][0]
            product_url = await _storage.get_public_url(product_key)

            if state["face_image_keys"]:
                face_key = state["face_image_keys"][i % len(state["face_image_keys"])]
                face_url = await _storage.get_public_url(face_key)
                tasks.append(self._generate_with_face(face_url, product_url, scene.image_prompt, i))
            else:
                tasks.append(self._generate_flux(scene.image_prompt, i, cost_tracker))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        images: list[GeneratedImage] = []
        for r in results:
            if isinstance(r, Exception):
                continue
            images.append(r)

        # Sort by quality score, keep best
        images.sort(key=lambda x: x.quality_score, reverse=True)
        state["generated_images"] = images
        return state

    async def _generate_flux(self, prompt: str, scene_index: int,
                              cost_tracker: CostTracker) -> GeneratedImage:
        url = await _fal.flux(prompt)
        cost_tracker.add_image("flux_pro_ultra")

        img_data = await download_image(url)
        quality = laplacian_variance(img_data)
        key = f"images/{scene_index}_flux.jpg"
        await _storage.upload_bytes(img_data, key, content_type="image/jpeg")

        return GeneratedImage(
            url=url,
            storage_key=key,
            scene_index=scene_index,
            quality_score=quality,
            generation_method="flux",
        )

    async def _generate_with_face(self, face_url: str, product_url: str,
                                   prompt: str, scene_index: int) -> GeneratedImage:
        url = await _fal.instant_id(face_url, prompt)

        img_data = await download_image(url)
        quality = laplacian_variance(img_data)
        key = f"images/{scene_index}_instantid.jpg"
        await _storage.upload_bytes(img_data, key, content_type="image/jpeg")

        return GeneratedImage(
            url=url,
            storage_key=key,
            scene_index=scene_index,
            quality_score=quality,
            generation_method="instantid",
        )

    async def _generate_tryon(self, person_url: str, garment_url: str,
                               scene_index: int) -> GeneratedImage:
        url = await _replicate.idm_vton(person_url, garment_url)

        img_data = await download_image(url)
        quality = laplacian_variance(img_data)
        key = f"images/{scene_index}_tryon.jpg"
        await _storage.upload_bytes(img_data, key, content_type="image/jpeg")

        return GeneratedImage(
            url=url,
            storage_key=key,
            scene_index=scene_index,
            quality_score=quality,
            generation_method="idm_vton",
        )

    async def _mock_images(self, state: PipelineState, plan: PromptPlan) -> list[GeneratedImage]:
        images = []
        for scene in plan.scenes:
            img_data = generate_placeholder_image(text=f"Scene {scene.index}")
            key = f"images/mock_{scene.index}.jpg"
            await _storage.upload_bytes(img_data, key, content_type="image/jpeg")
            url = await _storage.get_public_url(key)
            images.append(GeneratedImage(
                url=url,
                storage_key=key,
                scene_index=scene.index,
                quality_score=100.0,
                generation_method="mock",
            ))
        return images
