import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_flux_returns_url():
    from app.clients.fal_client import FalClient
    client = FalClient()

    mock_result = {"images": [{"url": "https://cdn.fal.ai/test.jpg"}]}
    with patch("fal_client.run", return_value=mock_result):
        url = await client.flux("test product photo")

    assert url == "https://cdn.fal.ai/test.jpg"


@pytest.mark.asyncio
async def test_kling_image_to_video_returns_url():
    from app.clients.fal_client import FalClient
    client = FalClient()

    mock_result = {"video": {"url": "https://cdn.fal.ai/test.mp4"}}
    with patch("fal_client.subscribe", return_value=mock_result):
        url = await client.kling_image_to_video(
            "https://example.com/image.jpg", "product showcase"
        )

    assert url == "https://cdn.fal.ai/test.mp4"
