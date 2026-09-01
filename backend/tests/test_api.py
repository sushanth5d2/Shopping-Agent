import os
os.environ['SHOPAGENT_DATABASE_URL']='sqlite:///./test_api.db'
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
from app import models
Base.metadata.create_all(bind=engine)

def test_health():
 with TestClient(app) as c: assert c.get('/api/health').status_code==200

def test_batch_creates_multiple_todo_items():
    with TestClient(app) as c:
        email='batch-test@example.com'; password='strong-password-123'
        r=c.post('/api/auth/register',json={'email':email,'password':password})
        if r.status_code==409:
            r=c.post('/api/auth/login',json={'email':email,'password':password})
        assert r.status_code in (200,201)
        token=r.json()['access_token']
        x=c.post('/api/batch/process',headers={'Authorization':f'Bearer {token}'},json={
            'urls':[], 'todo_items':['Sony WH-1000XM6','Logitech MX Master 3S','USB-C 100W cable']
        })
        assert x.status_code==200
        body=x.json()
        assert body['summary']['todo_created']==3
        assert len(body['todo_created'])==3


def test_batch_rejects_empty_request():
    with TestClient(app) as c:
        r=c.post('/api/batch/process',json={'urls':[],'todo_items':[]})
        assert r.status_code in (401,400)
