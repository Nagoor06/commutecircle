import pytest


def test_filter_and_public_contract(client):
    response = client.get("/v1/pickup-points", params={"city": "TestCity"})
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Public point A"
    assert set(rows[0]) == {"id", "name", "city", "latitude", "longitude"}
    assert "x-request-id" in response.headers


@pytest.mark.parametrize(
    "params",
    [{}, {"city": ""}, {"city": "   "}, {"city": "X", "limit": 101}, {"city": "X", "offset": -1}],
)
def test_validation(client, params):
    assert client.get("/v1/pickup-points", params=params).status_code == 422


def test_empty_and_pagination(client):
    assert client.get("/v1/pickup-points?city=Missing").json() == []
    assert client.get("/v1/pickup-points?city=TestCity&offset=1").json() == []
