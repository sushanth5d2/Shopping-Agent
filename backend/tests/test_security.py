from app.security import hash_password,verify_password,access_token

def test_password_hash():
 h=hash_password('a-strong-password');assert h!='a-strong-password';assert verify_password(h,'a-strong-password');assert not verify_password(h,'wrong')
def test_token():assert isinstance(access_token(1),str)
