from app.config import settings
from app.pipeline.state import PipelineState, VideoChunk
from app.services.storage import StorageService
from app.utils.cost_tracker import CostTracker

_storage = StorageService()


class SelectorAgent:
    """Scores video chunks and selects the best ones for assembly."""

    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        chunks = state["video_chunks"]

        if not chunks:
            state["selected_chunks"] = []
            return state

        if settings.mock:
            state["selected_chunks"] = chunks
            return state

        scored = await self._score_chunks(chunks)
        scored.sort(key=lambda c: c.quality_score, reverse=True)

        # Keep best chunk per scene, preserving scene order
        seen_scenes: set[int] = set()
        selected: list[VideoChunk] = []
        for chunk in sorted(scored, key=lambda c: c.scene_index):
            if chunk.scene_index not in seen_scenes:
                seen_scenes.add(chunk.scene_index)
                selected.append(chunk)

        # Sort final selection by scene_index for assembly order
        selected.sort(key=lambda c: c.scene_index)
        state["selected_chunks"] = selected
        return state

    async def _score_chunks(self, chunks: list[VideoChunk]) -> list[VideoChunk]:
        import tempfile
        import cv2
        import numpy as np
        from pathlib import Path

        for chunk in chunks:
            try:
                local = await _storage.download_to(chunk.storage_key)
                score = await _compute_video_score(local)
                chunk.quality_score = score
                Path(local).unlink(missing_ok=True)
            except Exception:
                pass  # keep existing score if analysis fails

        return chunks


async def _compute_video_score(video_path: str) -> float:
    import cv2
    import numpy as np
    import asyncio

    def _sync_score(path: str) -> float:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            return 50.0

        sharpness_scores = []
        prev_gray = None
        flow_scores = []
        frame_count = 0

        while frame_count < 30:  # sample up to 30 frames
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            sharpness_scores.append(lap_var)

            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, gray, None,
                    0.5, 3, 15, 3, 5, 1.2, 0
                )
                mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
                flow_scores.append(float(np.std(mag)))

            prev_gray = gray
            frame_count += 1

        cap.release()

        avg_sharpness = float(np.mean(sharpness_scores)) if sharpness_scores else 0.0
        avg_flow_std = float(np.mean(flow_scores)) if flow_scores else 0.0

        # Normalize: higher sharpness is better, lower flow std = smoother motion
        sharpness_norm = min(avg_sharpness / 500.0, 1.0) * 60
        motion_norm = max(0.0, 1.0 - avg_flow_std / 10.0) * 40
        return sharpness_norm + motion_norm

    return await asyncio.to_thread(_sync_score, video_path)
