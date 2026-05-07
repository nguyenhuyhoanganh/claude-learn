import pytest
import respx
import httpx


@pytest.mark.asyncio
async def test_kling_image_to_video_success():
    from app.clients.kling_client import KlingClient
    client = KlingClient()

    task_id = "task-abc-123"
    with respx.mock:
        respx.post("https://api.klingai.com/v1/videos/image2video").mock(
            return_value=httpx.Response(200, json={"data": {"task_id": task_id}})
        )
        respx.get(f"https://api.klingai.com/v1/videos/image2video/{task_id}").mock(
            return_value=httpx.Response(200, json={
                "data": {
                    "task_status": "succeed",
                    "task_result": {"videos": [{"url": "https://cdn.kling.ai/test.mp4"}]},
                }
            })
        )

        url = await client.image_to_video("https://example.com/img.jpg", "product shot")

    assert url == "https://cdn.kling.ai/test.mp4"


@pytest.mark.asyncio
async def test_kling_image_to_video_failure():
    from app.clients.kling_client import KlingClient
    client = KlingClient()

    task_id = "task-fail"
    with respx.mock:
        respx.post("https://api.klingai.com/v1/videos/image2video").mock(
            return_value=httpx.Response(200, json={"data": {"task_id": task_id}})
        )
        respx.get(f"https://api.klingai.com/v1/videos/image2video/{task_id}").mock(
            return_value=httpx.Response(200, json={
                "data": {"task_status": "failed", "task_status_msg": "quota exceeded"}
            })
        )

        with pytest.raises(RuntimeError, match="Kling failed"):
            await client.image_to_video("https://example.com/img.jpg", "test")
