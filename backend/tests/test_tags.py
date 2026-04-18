def test_list_tags_empty(client):
    res = client.get("/api/tags")
    assert res.status_code == 200
    assert res.json() == []


def test_list_tags_after_tagging(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["music", "lofi"]})
    res = client.get("/api/tags")
    assert set(res.json()) == {"music", "lofi"}


def test_list_tags_sorted(client, sample_video):
    vid = sample_video["id"]
    client.patch(f"/api/videos/{vid}/tags", json={"tags": ["zzz", "aaa", "mmm"]})
    tags = client.get("/api/tags").json()
    assert tags == sorted(tags)
