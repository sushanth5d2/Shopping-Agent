from dataclasses import dataclass

@dataclass
class CheckoutResult:
 status:str
 order_number:str=''
 provider_reference:str=''
 message:str=''
 payment_url:str=''
 step_reached:str=''

class CheckoutAdapter:
 name='abstract'
 def checkout(self,context)->CheckoutResult:raise NotImplementedError

class ManualHandoffCheckoutAdapter(CheckoutAdapter):
 name='manual-handoff'
 def checkout(self,context):
  return CheckoutResult(status='USER_ACTION_REQUIRED',message='Open the retailer page and complete checkout manually.')

class RetailerCheckoutAdapter(CheckoutAdapter):
 """Uses PurchaseAgent to automate add-to-cart and navigate to payment page."""
 name='retailer'
 def checkout(self,context):
  from .purchase_agent import PurchaseAgent
  agent=PurchaseAgent(headless=False)
  url=context.get('url','')
  store=context.get('store','')
  product=context.get('product','')
  task_id=context.get('task_id','')
  result=agent.execute(url,store,product,task_id)
  if result.success:
   return CheckoutResult(status='PAYMENT_READY',payment_url=result.payment_url,step_reached=result.step_reached,message=f'Agent reached {result.step_reached}. Complete payment manually.')
  return CheckoutResult(status='USER_ACTION_REQUIRED',step_reached=result.step_reached,message=result.message or 'Agent could not complete checkout. Please complete manually.')
