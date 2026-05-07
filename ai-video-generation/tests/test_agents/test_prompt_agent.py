import pytest
import os


@pytest.mark.asyncio
async def test_prompt_agent_mock_mode(monkeypatch):
    monkeypatch.setenv("MOCK", "true")
    # Reload settings after env change
    import importlib
    import app.config as cfg_module
    importlib.reload(cfg_module)

    from app.pipeline.agents.prompt_agent import PromptAgent
    from app.pipeline.state import PipelineState
    from app.utils.cost_tracker import CostTracker

    state = PipelineState(
        job_id="test-001",
        prompt="Running shoes for athletes",
        product_image_keys=["uploads/shoe.jpg"],
        face_image_keys=[],
        n_chunks=3,
        chunk_duration=5,
        language="en",
        tone="energetic",
        video_model="kling-v2-5-turbo",
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

    agent = PromptAgent()
    result = await agent.run(state, CostTracker())

    assert result["prompt_plan"] is not None
    plan = result["prompt_plan"]
    assert len(plan.scenes) == 3
    assert plan.narration_script != ""
    assert plan.language == "en"
