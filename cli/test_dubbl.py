import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from dubbl import Client, DubblError, NoRedirect

class ClientTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.creds=Path(self.temp.name)/'credentials.json'
        self.creds.write_text(json.dumps({'api_key':'dk_test_secret','base_url':'https://books.example'}))
        self.client=Client(self.creds)

    def test_list_fetches_every_page(self):
        with patch.object(self.client,'request',side_effect=[{'data':[{'id':'one'}],'pagination':{'totalPages':2}},{'data':[{'id':'two'}],'pagination':{'totalPages':2}}]) as request:
            self.assertEqual(self.client.list('expenses'),[{'id':'one'},{'id':'two'}])
            self.assertEqual(request.call_args.kwargs['query']['page'],2)

    def test_refuses_foreign_endpoint_before_network(self):
        with patch.object(self.client.opener,'open') as open_request:
            for endpoint in ['https://other.example/','../contacts','/accounts','accounts?key=x']:
                with self.assertRaises(DubblError):self.client.request('GET',endpoint)
            open_request.assert_not_called()

    def test_error_redacts_credential(self):
        error=HTTPError('https://books.example',401,'Unauthorized',{},io.BytesIO(b'dk_test_secret'))
        with patch.object(self.client.opener,'open',side_effect=error):
            with self.assertRaises(DubblError) as caught:self.client.request('GET','accounts')
            self.assertNotIn('dk_test_secret',str(caught.exception))
            self.assertIn('401',str(caught.exception))

    def test_redirect_is_refused(self):
        with self.assertRaises(DubblError):
            NoRedirect().redirect_request(None,None,302,'Found',{},'https://other.example')

    def test_expense_request_preserves_decimal_units(self):
        response=io.BytesIO(b'{"expenseClaim":{"totalAmount":1323}}')
        with patch.object(self.client.opener,'open',return_value=response) as request:
            result=self.client.request('POST','expenses',{'currencyCode':'EUR','items':[{'amount':13.23}]})
            self.assertEqual(json.loads(request.call_args.args[0].data)['items'][0]['amount'],13.23)
            self.assertEqual(result['expenseClaim']['totalAmount'],1323)

if __name__=='__main__':unittest.main()
