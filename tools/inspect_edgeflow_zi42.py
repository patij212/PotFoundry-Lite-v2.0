import json
p=r"c:\Users\patij212\Downloads\PotFoundry-Lite-v2.0\tools\edgeflow_verbose_diagnostics.jsonl"
found=None
with open(p,'r',encoding='utf-8') as f:
    for line in f:
        line=line.strip()
        if not line: continue
        obj=json.loads(line)
        rows=obj.get('rows',[])
        for r in rows:
            if isinstance(r,dict) and r.get('zi')==42 and 'R_new_raw_sample' in r and 'Env_to_use_sample' in r:
                found=r
if not found:
    print('NOT_FOUND')
    raise SystemExit(1)
Rnew=found['R_new_raw_sample']
# Ensure Env is a sequence (not None) so zip() and indexing are safe and consistent
Env = found.get('Env_to_use_sample') or found.get('Env_to_use_raw_post') or found.get('Env_to_use')
if Env is None:
    Env = []
min_final=found.get('min_final_raw')
viol=[]
for i,(r,e) in enumerate(zip(Rnew, Env)):
    try:
        if r + 1e-12 < e:
            viol.append({'i':i,'R_new':r,'Env':e,'diff':e-r})
    except Exception:
        # skip non-numeric comparisons
        continue
        viol.append({'i':i,'R_new':r,'Env':e,'diff':e-r})
summary={
    'zi': found.get('zi'),
    'z': found.get('z'),
    'len_Rnew': len(Rnew),
    'len_Env': len(Env) if Env is not None else None,
    'min_final_raw_field': min_final,
    'min_Rnew': min(Rnew) if Rnew else None,
    'min_Env': min(Env) if Env else None,
    'violations_count': len(viol),
    'violations_sample': viol[:10]
}
print(json.dumps(summary, indent=2))
# print small side-by-side sample at first 24 indices for quick view
sample_n=24
pairs=[{'i':i,'R_new':Rnew[i],'Env':Env[i],'R_raw':found.get('R_raw_sample',[None]*len(Rnew))[i]} for i in range(min(sample_n,len(Rnew)))]
print('\nSAMPLE_PAIRS_FIRST')
for p in pairs:
    print(f"i={p['i']:3d}  R_new={p['R_new']:10.6f}  Env={p['Env']:10.6f}  R_raw={p['R_raw']:10.6f}")
# If violations, print a few
if viol:
    print('\nVIOLATIONS (first 10):')
    for v in viol[:10]:
        print(f"i={v['i']} R_new={v['R_new']} Env={v['Env']} diff={v['diff']}")
else:
    print('\nNo violations: R_new_raw_sample >= Env_to_use_sample elementwise.')
