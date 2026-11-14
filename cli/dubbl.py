#!/usr/bin/env python3
"""Dubbl REST client. Request bodies follow the endpoint's native money units."""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parent

class DubblError(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise DubblError(f'HTTP {code} redirect refused: use the canonical API URL, and a Cloudflare Access service token if the host is gated')

class Client:
    def __init__(self, credentials=None, base_url=None, organization=None):
        config = json.loads(Path(credentials or ROOT/'credentials/dubbl.json').read_text())
        self.key = config['api_key']
        if not isinstance(self.key, str) or not self.key.startswith('dk_'):
            raise DubblError('credentials must contain a Dubbl api_key')
        base = base_url or os.environ.get('DUBBL_URL') or config.get('base_url')
        if not base:
            raise DubblError('base URL required: pass --base-url, set DUBBL_URL, or put base_url in the credentials file')
        self.base = base.rstrip('/')
        u = urlsplit(self.base)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path:
            raise DubblError('base URL must be an HTTPS origin')
        self.organization = organization or config.get('organization_id')
        # When the deployment sits behind Cloudflare Access, non-person
        # callers that use the REST API (this CLI, import scripts) pass a
        # service token on every request. The token only passes the edge; the
        # API key is what authorises. MCP clients cannot use one: /api/mcp must
        # answer 401 with its OAuth discovery metadata, and Access answers 302.
        # Optional: a base URL reached another way (a private network, a local
        # port) needs neither value.
        self.cf_client_id = os.environ.get('CF_ACCESS_CLIENT_ID') or config.get('cf_access_client_id')
        self.cf_client_secret = os.environ.get('CF_ACCESS_CLIENT_SECRET') or config.get('cf_access_client_secret')
        self.opener = build_opener(NoRedirect())

    def _access_headers(self):
        if not (self.cf_client_id and self.cf_client_secret):
            return {}
        return {'CF-Access-Client-Id': self.cf_client_id,
                'CF-Access-Client-Secret': self.cf_client_secret}

    def request(self, method, endpoint, body=None, query=None):
        if not endpoint or endpoint.startswith('/') or '..' in endpoint or urlsplit(endpoint).scheme or '?' in endpoint or '#' in endpoint:
            raise DubblError('endpoint must be relative to /api/v1/, e.g. expenses')
        url = self.base+'/api/v1/'+endpoint
        if query:
            url += '?'+urlencode(query)
        headers = {'Authorization':'Bearer '+self.key,'Accept':'application/json','User-Agent':'dubbl-cli/0.1'}
        headers.update(self._access_headers())
        if self.organization:
            headers['x-organization-id'] = self.organization
        data = None
        if body is not None:
            data = json.dumps(body, allow_nan=False).encode()
            headers['Content-Type'] = 'application/json'
        req = Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=60) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as e:
            message = e.read().decode(errors='replace').replace(self.key, '[REDACTED]')
            if self.cf_client_secret:
                message = message.replace(self.cf_client_secret, '[REDACTED]')
            raise DubblError(f'{method} {endpoint}: HTTP {e.code}: {message[:1000]}') from None
        except URLError as e:
            raise DubblError(f'{method} {endpoint}: connection failed ({e.reason})') from None

    def list(self, endpoint, query=None):
        query = dict(query or {})
        page = 1
        result = []
        while True:
            payload = self.request('GET', endpoint, query={**query, 'page':page,'limit':100})
            if 'data' not in payload:
                arrays = [v for v in payload.values() if isinstance(v,list)]
                if len(arrays) != 1:
                    raise DubblError('Response has no unambiguous collection')
                return arrays[0]
            result.extend(payload['data'])
            if page >= payload.get('pagination',{}).get('totalPages',1):
                return result
            page += 1

    def whoami(self):
        accounts = self.list('accounts')
        orgs = {a['organizationId'] for a in accounts}
        if len(orgs) != 1:
            raise DubblError('Cannot resolve one organization from chart of accounts')
        resolved = orgs.pop()
        if self.organization and self.organization != resolved:
            raise DubblError('Configured organization differs from API key scope')
        self.organization = resolved
        return self.request('GET','organization')['organization']

    def download(self, document_id):
        payload = self.request('GET',f'documents/{document_id}/download')
        return self.transfer(payload['downloadUrl'])

    def transfer(self, url, data=None, mime=None):
        # Signed storage requests never carry the Dubbl API credential.
        if urlsplit(url).scheme not in ('https','http'):
            raise DubblError('Unsupported document storage URL scheme')
        headers = {'User-Agent':'dubbl-cli/0.1'}
        if mime:
            headers['Content-Type'] = mime
        try:
            with self.opener.open(Request(url,data=data,headers=headers,method='PUT' if data is not None else 'GET'),timeout=60) as r:
                return r.read()
        except (HTTPError,URLError) as e:
            status = getattr(e,'code',None)
            raise DubblError(f'Document transfer failed ({status or type(e).__name__}); signed URL omitted') from None

    def upload(self, path, folder_id=None, entity_type=None, entity_id=None, name=None, visibility='organization'):
        path = Path(path)
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        filename = name or path.name
        # Reconcile incomplete uploads and retries by stable metadata + actual bytes.
        matches = [d for d in self.list('documents') if d['fileName']==filename and d.get('folderId')==folder_id and d.get('entityType')==entity_type and d.get('entityId')==entity_id and d.get('visibility')==visibility]
        if len(matches)>1:
            raise DubblError('Multiple matching documents; resolve duplicates before uploading')
        if matches:
            doc = matches[0]
            if doc['fileSize'] != len(data):
                raise DubblError('Existing document name has a different size')
            try:
                existing = self.download(doc['id'])
            except DubblError:
                # The same recorded key can be re-signed through the receipt URL endpoint,
                # but no public upload retry endpoint exists. Stop rather than orphan another row.
                raise DubblError(f"Document {doc['id']} exists but bytes cannot be verified; do not create a duplicate") from None
            if existing != data:
                raise DubblError('Existing document bytes differ')
            return doc
        body = {'fileName':filename,'fileSize':len(data),'mimeType':mime,'visibility':visibility}
        for k,v in [('folderId',folder_id),('entityType',entity_type),('entityId',entity_id)]:
            if v is not None: body[k]=v
        result = self.request('POST','documents',body)
        doc = result['document']
        try:
            self.transfer(result['uploadUrl'],data,mime)
            actual = self.download(doc['id'])
            if hashlib.sha256(actual).digest()!=hashlib.sha256(data).digest():
                raise DubblError('Uploaded document checksum differs')
        except DubblError as e:
            raise DubblError(f"Document metadata created as {doc['id']}, but upload verification failed: {e}") from None
        return doc

def query_pairs(values):
    query = {}
    for value in values or []:
        if '=' not in value:
            raise DubblError('Query parameters must be KEY=VALUE')
        k,v = value.split('=',1)
        query[k]=v
    return query

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--credentials',type=Path)
    p.add_argument('--base-url')
    p.add_argument('--organization')
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('whoami')
    q=sub.add_parser('list');q.add_argument('endpoint');q.add_argument('--query',action='append')
    q=sub.add_parser('get');q.add_argument('endpoint');q.add_argument('--query',action='append')
    for command in ['create','patch']:
        q=sub.add_parser(command);q.add_argument('endpoint');q.add_argument('--file',required=True,type=Path,help='JSON request body')
    q=sub.add_parser('request');q.add_argument('method',choices=['GET','POST','PATCH','PUT','DELETE']);q.add_argument('endpoint');q.add_argument('--file',type=Path);q.add_argument('--query',action='append')
    q=sub.add_parser('upload');q.add_argument('file',type=Path);q.add_argument('--folder');q.add_argument('--entity-type');q.add_argument('--entity-id');q.add_argument('--name');q.add_argument('--visibility',choices=['organization','private'],default='organization')
    q=sub.add_parser('download');q.add_argument('id');q.add_argument('--output',required=True,type=Path)
    args=p.parse_args(argv)
    try:
        c=Client(args.credentials,args.base_url,args.organization)
        if args.command=='whoami':result=c.whoami()
        elif args.command=='list':result=c.list(args.endpoint,query_pairs(args.query))
        elif args.command=='get':result=c.request('GET',args.endpoint,query=query_pairs(args.query))
        elif args.command in ['create','patch']:result=c.request('POST' if args.command=='create' else 'PATCH',args.endpoint,json.loads(args.file.read_text()))
        elif args.command=='request':result=c.request(args.method,args.endpoint,json.loads(args.file.read_text()) if args.file else None,query_pairs(args.query))
        elif args.command=='upload':result=c.upload(args.file,args.folder,args.entity_type,args.entity_id,args.name,args.visibility)
        elif args.command=='download':
            data=c.download(args.id)
            with args.output.open('xb') as f:f.write(data)
            os.chmod(args.output,0o600)
            result={'saved':str(args.output),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        print(json.dumps(result,indent=2))
        return 0
    except (DubblError,OSError,ValueError,KeyError) as e:
        print(f'dubbl: {e}',file=sys.stderr)
        return 1

if __name__=='__main__':
    sys.exit(main())
