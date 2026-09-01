from app.services import true_total,normalize_price,product_match,decision,prediction,fake_discount,basket,PurchasePolicy

def test_true_total():assert true_total(100,10,5,2,7,3)==107
def test_price_normalization():assert normalize_price('₹25,499')==25499
def test_exact_match():assert product_match({'name':'Sony WH-1000XM6','brand':'Sony','model':'WH-1000XM6'},{'name':'Sony WH1000XM6','brand':'Sony','model':'WH1000XM6'})['match_score']>=75
def test_target_buy():assert decision(90,100,[120,110,100,95,90])['decision']=='BUY'
def test_prediction_guard():assert prediction([1,2],2,1)['available'] is False
def test_fake_discount():assert fake_discount(100,200,[100,101,99,100,102])['suspected']
def test_basket():
 r=basket([{'name':'A','listings':[{'store':'A','total':10},{'store':'B','total':12}]},{'name':'B','listings':[{'store':'A','total':10},{'store':'B','total':5}]}]);assert r['total']==15
