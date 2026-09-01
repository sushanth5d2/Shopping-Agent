from dataclasses import dataclass
@dataclass
class CheckoutResult:
 status:str
 order_number:str=''
 provider_reference:str=''
 message:str=''
class CheckoutAdapter:
 name='abstract'
 def checkout(self,context)->CheckoutResult:raise NotImplementedError
class ManualHandoffCheckoutAdapter(CheckoutAdapter):
 name='manual-handoff'
 def checkout(self,context):
  return CheckoutResult(status='USER_ACTION_REQUIRED',message='This retailer does not expose an approved automated checkout integration. Open the retailer page and complete checkout manually.')
class RetailerCheckoutAdapter(CheckoutAdapter):
 # Implement per retailer only when an authorized API/browser contract exists.
 name='retailer'
 def checkout(self,context):raise NotImplementedError
