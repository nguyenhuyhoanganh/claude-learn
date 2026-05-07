import pytest
import os


@pytest.mark.asyncio
async def test_full_pipeline_mock_mode(monkeypatch, tmp_path):
    """End-to-end pipeline test using mock mode — no API keys required."""
    monkeypatch.setenv("MOCK", "true")
    monkeypatch.setenv("LOCAL_STORAGE_PATH", str(tmp_path))
    monkeypatch.setenv("STORAGE_BACKEND", "local")

    import importlib
    import app.config as cfg_module
    importlib.reload(cfg_module)

    from app.pipeline.orchestrator import run_pipeline

    state = await run_pipeline(
        job_id="pipeline-test-001",
        prompt="Wireless headphones, premium sound quality",
        product_image_keys=["uploads/headphones.jpg"],
        face_image_keys=[],
        n_chunks=2,
        chunk_duration=5,
        language="en",
        tone="professional",
        video_model="mock",
    )

    assert state["error"] is None
    assert state["phase"] == "done"
    assert state["prompt_plan"] is not None
    assert len(state["generated_images"]) == 2
    assert len(state["video_chunks"]) == 2
    assert state["audio_result"] is not None
    assert state["final_video_key"] is not None
