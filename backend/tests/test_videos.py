import os


def test_list_videos_empty(client):
    res = client.get("/api/videos")
    assert res.status_code == 200
    assert res.json() == []


def test_list_videos_returns_all(client, sample_video):
    res = client.get("/api/videos")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["title"] == "Test Video"
    assert data[0]["tags"] == []


def test_get_video(client, sample_video):
    res = client.get(f"/api/videos/{sample_video['id']}")
    assert res.status_code == 200
    v = res.json()
    assert v["title"] == "Test Video"
    assert v["channel"] == "Test Channel"
    assert v["duration"] == 120
    assert v["tags"] == []


def test_get_video_not_found(client):
    res = client.get("/api/videos/999")
    assert res.status_code == 404


def test_patch_tags(client, sample_video):
    res = client.patch(
        f"/api/videos/{sample_video['id']}/tags",
        json={"tags": ["music", "lofi"]},
    )
    assert res.status_code == 200
    assert set(res.json()["tags"]) == {"music", "lofi"}


def test_patch_tags_replaces_existing(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music"]})
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["cooking"]})
    res = client.get(f"/api/videos/{vid}")
    assert res.json()["tags"] == ["cooking"]


def test_patch_tags_not_found(client):
    res = client.patch("/api/videos/999/tags", json={"tags": ["x"]})
    assert res.status_code == 404


def test_delete_video(client, sample_video):
    res = client.delete(f"/api/videos/{sample_video['id']}")
    assert res.status_code == 204
    assert not client.get(f"/api/videos/{sample_video['id']}").json().get("id")


def test_delete_removes_file(client, sample_video):
    file_path = sample_video["file_path"]
    client.delete(f"/api/videos/{sample_video['id']}")
    assert not os.path.exists(file_path)


def test_delete_not_found(client):
    res = client.delete("/api/videos/999")
    assert res.status_code == 404


def test_search_by_title(client, sample_video):
    res = client.get("/api/videos?q=Test")
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_search_no_match(client, sample_video):
    res = client.get("/api/videos?q=zzznomatch")
    assert res.json() == []


def test_filter_by_tag(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music"]})
    res = client.get("/api/videos?tag=music")
    assert len(res.json()) == 1


def test_filter_by_tag_no_match(client, sample_video):
    res = client.get("/api/videos?tag=jazz")
    assert res.json() == []
