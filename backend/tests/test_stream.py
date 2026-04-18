def test_stream_full_file(client, sample_video):
    res = client.get(f"/stream/{sample_video['id']}")
    assert res.status_code == 200
    assert res.headers["content-type"] == "video/mp4"
    assert res.headers["accept-ranges"] == "bytes"
    assert len(res.content) == 2048


def test_stream_not_found(client):
    res = client.get("/stream/999")
    assert res.status_code == 404


def test_stream_range_request(client, sample_video):
    res = client.get(
        f"/stream/{sample_video['id']}",
        headers={"range": "bytes=0-511"},
    )
    assert res.status_code == 206
    assert res.headers["content-range"] == "bytes 0-511/2048"
    assert res.headers["content-length"] == "512"
    assert len(res.content) == 512


def test_stream_range_open_end(client, sample_video):
    res = client.get(
        f"/stream/{sample_video['id']}",
        headers={"range": "bytes=1024-"},
    )
    assert res.status_code == 206
    assert len(res.content) == 1024
