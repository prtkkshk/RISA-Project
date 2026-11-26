"""Slide 1 target model: cash collected before festival day.
Every rate is anchored to the source data (warm channels) and labelled. Run: python3 analysis/target_model.py"""
SOURCE = dict(warm_brands=44, warm_opps=25, warm_wins=24, avg_deal=93333, cash_share=2000000/2240000, reneged=1/25)
print("Source warm win rate per brand touched: %.1f%%" % (100*SOURCE['warm_wins']/SOURCE['warm_brands']))

def model(c):
    rows=[]; deals=0
    for name, brands, win in c['sources']:
        d = brands*win; deals += d; rows.append((name, brands, win, d))
    confirmed = deals*c['avg_deal'] + c['anchor']
    cash_confirmed = deals*c['avg_deal']*c['cash_share'] + c['anchor']
    collected = cash_confirmed*c['collection']
    return rows, deals + (1 if c['anchor'] else 0), confirmed, cash_confirmed, collected

base = dict(avg_deal=93000, cash_share=0.89, collection=0.80, anchor=0, sources=[
  ("Partner referrals (24 partners x 1 intro)", 24, 0.45),
  ("Creator & community referrals", 19, 0.50),
  ("Inbound partner form", 17, 0.50),
  ("Alumni warm introductions", 8, 0.50),
  ("Leakage rescue (18 qualified, no deal)", 18, 0.25),
])
stretch = dict(avg_deal=105000, cash_share=0.95, collection=0.90, anchor=800000, sources=[
  ("Partner referrals (24 partners x 1.5 intros)", 36, 0.50),
  ("Creator & community referrals", 25, 0.55),
  ("Inbound partner form", 22, 0.55),
  ("Alumni warm introductions", 12, 0.55),
  ("Leakage rescue (18 qualified, no deal)", 18, 0.35),
])
for nm, c in [("BASE", base), ("STRETCH", stretch)]:
    rows, deals, conf, cashc, coll = model(c)
    print(f"\n{nm}")
    for r in rows: print(f"  {r[0]:45s} {r[1]:4d} brands x {r[2]:.0%} = {r[3]:5.1f} deals")
    print(f"  deals {deals:.1f} | confirmed Rs {conf/1e5:.1f}L | cash-type Rs {cashc/1e5:.1f}L | collected by fest Rs {coll/1e5:.1f}L")

# sensitivity on base: +/-20% each driver
print("\nSENSITIVITY (base, each driver +/-20%) -> collected Rs L")
import copy
_,_,_,_,b0 = model(base)
for drv in ["volume","win","avg_deal","collection"]:
    out=[]
    for f in (0.8,1.2):
        c=copy.deepcopy(base)
        if drv=="volume": c['sources']=[(n,int(round(b*f)),w) for n,b,w in c['sources']]
        if drv=="win": c['sources']=[(n,b,min(1,w*f)) for n,b,w in c['sources']]
        if drv=="avg_deal": c['avg_deal']*=f
        if drv=="collection": c['collection']=min(1,c['collection']*f)
        out.append(model(c)[4]/1e5)
    print(f"  {drv:11s} {out[0]:5.1f} .. {out[1]:5.1f}  (base {b0/1e5:.1f})")
