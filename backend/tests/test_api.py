import os
os.environ['SHOPAGENT_DATABASE_URL'] = 'sqlite:///./test_api.db'
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine, SessionLocal
from app import models
from app.seed import seed_data

Base.metadata.create_all(bind=engine)
db = SessionLocal()
seed_data(db)
db.close()

def test_health():
    with TestClient(app) as c:
        assert c.get('/api/health').status_code == 200

def test_user_registration_and_dashboard_fetch():
    with TestClient(app) as c:
        email = 'newuser@example.com'
        password = 'password123'
        r = c.post('/api/auth/register', json={'email': email, 'password': password})
        if r.status_code == 409:
            r = c.post('/api/auth/login', json={'email': email, 'password': password})
        assert r.status_code == 200
        token = r.json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}

        # Dashboard fetch
        dash = c.get('/api/dashboard', headers=headers)
        assert dash.status_code == 200
        dash_data = dash.json()
        assert 'todo' in dash_data
        assert 'stats' in dash_data

        # Items fetch
        items = c.get('/api/items', headers=headers)
        assert items.status_code == 200
        assert len(items.json().get('items', [])) >= 1

        # Deals fetch
        deals = c.get('/api/deals', headers=headers)
        assert deals.status_code == 200

def test_batch_creates_multiple_todo_items():
    with TestClient(app) as c:
        email = 'batch-test@example.com'
        password = 'strong-password-123'
        r = c.post('/api/auth/register', json={'email': email, 'password': password})
        if r.status_code == 409:
            r = c.post('/api/auth/login', json={'email': email, 'password': password})
        assert r.status_code in (200, 201)
        token = r.json()['access_token']
        x = c.post('/api/batch/process', headers={'Authorization': f'Bearer {token}'}, json={
            'urls': [], 'todo_items': ['Sony WH-1000XM6', 'Logitech MX Master 3S', 'USB-C 100W cable']
        })
        assert x.status_code == 200
        body = x.json()
        assert body['summary']['todo_created'] == 3
        assert len(body['todo_created']) == 3

def test_batch_rejects_empty_request():
    with TestClient(app) as c:
        r = c.post('/api/batch/process', json={'urls': [], 'todo_items': []})
        assert r.status_code in (401, 400)

def test_decision_lab_endpoint():
    with TestClient(app) as c:
        email = 'decision-user@example.com'
        password = 'password123'
        r = c.post('/api/auth/register', json={'email': email, 'password': password})
        if r.status_code == 409:
            r = c.post('/api/auth/login', json={'email': email, 'password': password})
        token = r.json()['access_token']
        headers = {'Authorization': f'Bearer {token}'}
        
        # Call Decision Lab for product 1
        res = c.get('/api/products/1/decision-lab', headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert 'shopagent_score' in data
        assert 'regret_shield' in data
        assert 'buy_vs_wait' in data
        assert 'second_opinion' in data
        assert 'deal_truth' in data
        assert 'reviews' in data

