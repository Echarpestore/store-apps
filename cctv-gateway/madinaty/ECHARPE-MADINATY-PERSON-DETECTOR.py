"""ECHARPE Madinaty multi-camera ROI directional-flow occupancy detector v662.
All configured Madinaty cameras are used. Camera 8 is the authoritative doorway camera using directional optical flow inside a fixed ROI.
No biometric identification. Conservative fail-open behavior: uncertainty suppresses alerts.
"""
from __future__ import annotations
import json, os, sys, time, urllib.request, math
from datetime import datetime, timezone, timedelta
# v720: liveness module lives next to this script (see echarpe_liveness.py).
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from echarpe_liveness import LivenessMonitor, EmptyStoreCorrector

ROOT=r"C:\ProgramData\ECHARPE\MadinatyCCTV"
CONFIG_PATH=os.path.join(ROOT,"activity-config.json")
MODEL_PATH=os.path.join(ROOT,"efficientdet_lite0.tflite")
PID_PATH=os.path.join(ROOT,"detector.pid")
LOG_PATH=os.path.join(ROOT,"logs","detector.log")
TRAFFIC_PATH=os.path.join(ROOT,"traffic-stats.json")
TRAFFIC_RETENTION_DAYS=90
OCCUPANCY_PATH=os.path.join(ROOT,"door-occupancy-state-v632.json")
AGENT="http://127.0.0.1:1985"
CAMERAS=(4,5,7,8)
STREAMS={c:f"rtsp://127.0.0.1:8554/camera{c}" for c in CAMERAS}
DEFAULT_CONFIG={
 "scoreThreshold":.42,"doorScoreThreshold":.15,"sampleSeconds":1.0,"doorSampleSeconds":.18,"staffStateMaxAgeSeconds":90,
 "doorCamera":8,"doorMode":"roi_directional_flow",
 "doorRoi":[.34,.24,.80,.99],"flowMinMagnitude":1.15,"flowMinActiveFraction":.006,
 "flowMinVerticalRatio":.58,"flowMinStepPixels":.65,"flowWindow":7,"flowVotesRequired":4,
 "flowMinCentroidTravel":.035,"flowCooldownSeconds":2.5,
 # Calibrated from the owner's Camera 8 screenshot (2026-09-10).
 # Red = inside line A; yellow = outside line B. Coordinates are normalized to the camera image.
 "doorInsideLine":[[.4372,.4838],[.5712,.5378]],
 "doorOutsideLine":[[.4612,.3549],[.5952,.3946]],
 "doorGateXMargin":.025,"doorLineHysteresis":.012,
 "doorStableFrames":2,"doorMinTrackFrames":3,"doorMaxJump":.13,"doorTrackTtlSeconds":3.5,
 "doorCrossMaxSeconds":5.0,"doorCooldownSeconds":2.0,"doorMinTravel":.075,
 "occupancyHoldSeconds":20,"emptyConfirmSeconds":10,
 "appearanceMatchThreshold":0.84,"appearanceStrongThreshold":0.92,
 "identityRetentionHours":18,"exitMatchWindowSeconds":900,
 "handoffMaxSeconds":12,"handoffStrongThreshold":0.90,
 "cameraGraph":{"8":[7,5],"7":[8,4,5],"5":[8,7,4],"4":[7,5]},
 "cashierCamera":4,"businessDayStartHour":6
}
def log(m):
    try:
        os.makedirs(os.path.dirname(LOG_PATH),exist_ok=True)
        with open(LOG_PATH,"a",encoding="utf-8") as f:f.write(time.strftime("%Y-%m-%dT%H:%M:%S ")+str(m)+"\n")
    except Exception:pass
def cfgload():
    c=dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH,"r",encoding="utf-8-sig") as f:
            x=json.load(f)
        if isinstance(x,dict):c.update(x)
    except Exception:pass
    return c
def req(path,payload=None):
    data=None if payload is None else json.dumps(payload,separators=(",",":")).encode()
    r=urllib.request.Request(AGENT+path,data=data,method="GET" if data is None else "POST")
    with urllib.request.urlopen(r,timeout=4) as h:return json.loads(h.read().decode() or "{}")

def _last_weekday(year,month,weekday):
    if month==12:
        nxt=datetime(year+1,1,1,tzinfo=timezone.utc)
    else:
        nxt=datetime(year,month+1,1,tzinfo=timezone.utc)
    d=nxt-timedelta(days=1)
    while d.weekday()!=weekday:
        d-=timedelta(days=1)
    return d

def _cairo_offset_hours(utc_dt):
    # Egypt business time without requiring external tzdata on Windows.
    y=utc_dt.year
    start_day=_last_weekday(y,4,4)
    end_day=_last_weekday(y,10,3)
    start_utc=(datetime(y,4,start_day.day,22,0,tzinfo=timezone.utc)-timedelta(days=1))
    end_utc=datetime(y,10,end_day.day,21,0,tzinfo=timezone.utc)
    return 3 if start_utc <= utc_dt < end_utc else 2

def cairo_datetime(ts=None):
    utc_dt=datetime.fromtimestamp(ts or time.time(),timezone.utc)
    return utc_dt+timedelta(hours=_cairo_offset_hours(utc_dt))

def cairo_parts(ts=None):
    dt=cairo_datetime(ts)
    return dt.strftime("%Y-%m-%d"),dt.strftime("%H")

def load_traffic():
    try:
        with open(TRAFFIC_PATH,"r",encoding="utf-8") as f:
            d=json.load(f)
        if isinstance(d,dict) and isinstance(d.get("days"),dict): return d
    except Exception: pass
    return {"version":662,"days":{}}

def save_traffic(data):
    try:
        os.makedirs(ROOT,exist_ok=True)
        data["version"]=662
        # bounded retention, newest keys only
        keys=sorted((data.get("days") or {}).keys(),reverse=True)
        for k in keys[TRAFFIC_RETENTION_DAYS:]:
            data["days"].pop(k,None)
        tmp=TRAFFIC_PATH+".tmp"
        with open(tmp,"w",encoding="utf-8") as f:
            json.dump(data,f,ensure_ascii=False,separators=(",",":"))
        os.replace(tmp,TRAFFIC_PATH)
    except Exception as e: log("traffic_save_failed "+str(e))

def _dayrow(data,day):
    return data.setdefault("days",{}).setdefault(day,{
        "entries":0,"exits":0,"uniqueVisitors":0,"hours":{},"identities":{},
        "uniqueStartedAtMs":0,"updatedAtMs":0
    })

def add_crossing(data,is_entry,ts=None,unique_delta=0):
    day,hour=cairo_parts(ts)
    row=_dayrow(data,day)
    hr=row["hours"].setdefault(hour,{"entries":0,"exits":0,"uniqueVisitors":0})
    if is_entry:
        row["entries"]=int(row.get("entries") or 0)+1
        hr["entries"]=int(hr.get("entries") or 0)+1
        if unique_delta>0:
            row["uniqueVisitors"]=int(row.get("uniqueVisitors") or 0)+int(unique_delta)
            hr["uniqueVisitors"]=int(hr.get("uniqueVisitors") or 0)+int(unique_delta)
            if not int(row.get("uniqueStartedAtMs") or 0):row["uniqueStartedAtMs"]=int((ts or time.time())*1000)
    else:
        row["exits"]=int(row.get("exits") or 0)+1
        hr["exits"]=int(hr.get("exits") or 0)+1
    row["updatedAtMs"]=int((ts or time.time())*1000)
    save_traffic(data)

def traffic_history(data,limit=31):
    days=data.get("days") or {}
    out=[]
    for key in sorted(days.keys(),reverse=True)[:max(1,min(int(limit),TRAFFIC_RETENTION_DAYS))]:
        r=days.get(key) or {}
        out.append({"dateKey":key,"entries":int(r.get("entries") or 0),
                    "exits":int(r.get("exits") or 0),
                    "uniqueVisitors":int(r.get("uniqueVisitors") or 0),
                    "uniqueStartedAtMs":int(r.get("uniqueStartedAtMs") or 0),
                    "hours":r.get("hours") or {},
                    "updatedAtMs":int(r.get("updatedAtMs") or 0)})
    return out

def _cosine(a,b):
    if not a or not b or len(a)!=len(b):return 0.0
    dot=sum(float(x)*float(y) for x,y in zip(a,b))
    na=math.sqrt(sum(float(x)*float(x) for x in a));nb=math.sqrt(sum(float(y)*float(y) for y in b))
    return dot/max(1e-9,na*nb)

def _appearance(cv2,frame,x,y,w,h):
    H,W=frame.shape[:2]
    x0=max(0,int(x));y0=max(0,int(y+h*.18));x1=min(W,int(x+w));y1=min(H,int(y+h*.82))
    if x1-x0<8 or y1-y0<12:return []
    crop=frame[y0:y1,x0:x1]
    hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
    hist=cv2.calcHist([hsv],[0,1],None,[8,4],[0,180,0,256])
    cv2.normalize(hist,hist)
    return [round(float(v),5) for v in hist.flatten()]

class IdentityBook:
    def __init__(self,data,cfg):
        self.data=data;self.cfg=cfg;self.inside=set();self.last_exit_ms=0;self.last_exit_id=""
        self.seq=1
    def _row(self,ts):
        day,_=cairo_parts(ts);return _dayrow(self.data,day)
    def _match(self,desc,ts,inside_only=False):
        row=self._row(ts);best=None;bs=0.0
        cutoff=int((ts-float(self.cfg["identityRetentionHours"])*3600)*1000)
        for iid,v in (row.get("identities") or {}).items():
            if inside_only and iid not in self.inside:continue
            if int(v.get("lastSeenAtMs") or 0)<cutoff:continue
            sc=_cosine(desc,v.get("appearance") or [])
            if sc>bs:best=iid;bs=sc
        return best,bs
    def _new_id(self,ts):
        day,_=cairo_parts(ts)
        while True:
            iid="v"+day.replace("-","")+"_"+str(self.seq);self.seq+=1
            if iid not in self._row(ts).setdefault("identities",{}):return iid
    def entry(self,desc,ts):
        row=self._row(ts);ids=row.setdefault("identities",{})
        iid,score=self._match(desc,ts,False)
        threshold=float(self.cfg["appearanceMatchThreshold"])
        is_new=not iid or score<threshold
        if is_new:
            iid=self._new_id(ts)
            ids[iid]={"appearance":desc,"firstSeenAtMs":int(ts*1000),"lastSeenAtMs":int(ts*1000),"entries":0}
        v=ids[iid]
        # Running appearance update helps angle/light changes, but never stores an image or face.
        old=v.get("appearance") or []
        if old and desc and len(old)==len(desc):
            v["appearance"]=[round(float(a)*.7+float(b)*.3,5) for a,b in zip(old,desc)]
        elif desc:v["appearance"]=desc
        v["lastSeenAtMs"]=int(ts*1000);v["entries"]=int(v.get("entries") or 0)+1
        duplicate_inside=iid in self.inside
        self.inside.add(iid)
        return iid,(1 if is_new else 0),score,duplicate_inside
    def exit(self,desc,ts):
        iid,score=self._match(desc,ts,True)
        if not iid:
            iid2,score2=self._match(desc,ts,False)
            if score2>=float(self.cfg["appearanceStrongThreshold"]):iid,score=iid2,score2
        if iid and iid in self.inside:self.inside.remove(iid)
        self.last_exit_ms=int(ts*1000);self.last_exit_id=iid or ""
        return iid,score
def detect(detector,mp,cv2,frame):
    rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
    h,w=frame.shape[:2]; boxes=[]
    for d in result.detections:
        if not d.categories or str(d.categories[0].category_name).lower()!="person":continue
        b=d.bounding_box
        boxes.append({"score":float(d.categories[0].score),
          "cx":(b.origin_x+b.width*.5)/max(1,w),"cy":(b.origin_y+b.height*.5)/max(1,h),
          # Bottom-centre ("feet") is much more stable for a floor/door line than bbox centre.
          "fx":(b.origin_x+b.width*.5)/max(1,w),"fy":(b.origin_y+b.height*.96)/max(1,h),
          "bw":b.width/max(1,w),"bh":b.height/max(1,h),
          "appearance":_appearance(cv2,frame,b.origin_x,b.origin_y,b.width,b.height)})
    return boxes

class DualLineGateTracker:
    """Camera-8 doorway tracker.

    A count is emitted only after the SAME moving track is observed stably on one
    side, passes through the corridor between both owner-calibrated lines, and is
    then observed stably on the opposite side.

    Stationary mannequins, people standing near the door, partial detections and
    one-line touches do not change occupancy.
    """
    def __init__(self,cfg):
        self.cfg=cfg;self.next=1;self.tracks={};self.entries=0;self.exits=0
    def _line_y(self,line,x):
        (x1,y1),(x2,y2)=line
        if abs(x2-x1)<1e-6:return (y1+y2)*.5
        t=(x-x1)/(x2-x1)
        return y1+(y2-y1)*t
    def _in_gate_x(self,x):
        il=self.cfg["doorInsideLine"];ol=self.cfg["doorOutsideLine"]
        lo=min(il[0][0],il[1][0],ol[0][0],ol[1][0])-float(self.cfg["doorGateXMargin"])
        hi=max(il[0][0],il[1][0],ol[0][0],ol[1][0])+float(self.cfg["doorGateXMargin"])
        return lo<=x<=hi
    def _zone(self,x,y):
        if not self._in_gate_x(x):return "off"
        yo=self._line_y(self.cfg["doorOutsideLine"],x)
        yi=self._line_y(self.cfg["doorInsideLine"],x)
        h=float(self.cfg["doorLineHysteresis"])
        if y<yo-h:return "outside"
        if y>yi+h:return "inside"
        return "between"
    def _match_cost(self,p,t):
        d=math.hypot(float(p["fx"])-float(t["fx"]),float(p["fy"])-float(t["fy"]))
        app=_cosine(p.get("appearance") or [],t.get("appearance") or [])
        # Position dominates; appearance only helps avoid swaps when two people cross together.
        return d-(.055*app),d,app
    def _stable_zone(self,t,zone):
        if zone==t.get("zoneRaw"):
            t["zoneFrames"]=int(t.get("zoneFrames") or 0)+1
        else:
            t["zoneRaw"]=zone;t["zoneFrames"]=1
        if t["zoneFrames"]>=int(self.cfg["doorStableFrames"]):
            t["zoneStable"]=zone
            return zone
        return None
    def _transition(self,tid,t,stable,now):
        if not stable or stable=="off":return None
        cooldown=float(self.cfg["doorCooldownSeconds"])
        if now-float(t.get("lastCountAt") or 0)<cooldown:return None
        min_travel=float(self.cfg["doorMinTravel"]);max_seconds=float(self.cfg["doorCrossMaxSeconds"])

        if stable=="between":
            anchor=t.get("anchor")
            if anchor is None:
                t["anchor"]="between_entry";t["armedAt"]=now;t["sawBetween"]=True;t["anchorFy"]=t["fy"]
                return None
            if anchor=="inside":
                travel=float(t.get("anchorFy") or t["fy"])-float(t["fy"])
                elapsed=now-float(t.get("armedAt") or now)
                if elapsed<=max_seconds and travel>=min_travel:
                    self.exits+=1
                    t["lastCountAt"]=now;t["anchor"]="between_exit";t["armedAt"]=now;t["sawBetween"]=True;t["anchorFy"]=t["fy"]
                    return {"entry":False,"trackId":tid,"appearance":t.get("appearance") or [],
                            "pid":t.get("pid"),"at":now,"travel":travel,"elapsed":elapsed,
                            "confidence":min(1.0,.72+min(.20,travel))}
            elif anchor=="outside":
                t["sawBetween"]=True
            return None

        if stable in ("outside","inside"):
            anchor=t.get("anchor")
            if anchor is None:
                t["anchor"]=stable;t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
                return None
            if anchor=="between_entry" and stable=="inside":
                elapsed=now-float(t.get("armedAt") or now)
                travel=float(t["fy"])-float(t.get("anchorFy") or t["fy"])
                if elapsed<=max_seconds and travel>=min_travel:
                    self.entries+=1
                    t["lastCountAt"]=now;t["anchor"]="inside";t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
                    return {"entry":True,"trackId":tid,"appearance":t.get("appearance") or [],
                            "pid":t.get("pid"),"at":now,"travel":travel,"elapsed":elapsed,
                            "confidence":min(1.0,.72+min(.20,travel))}
                if elapsed>max_seconds:
                    t["anchor"]=stable;t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
                return None
            if anchor=="between_exit":
                if stable=="outside":
                    t["anchor"]="outside";t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
                elif stable=="inside":
                    t["anchor"]="inside";t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
                return None
            if stable==anchor:
                if t.get("sawBetween") and now-float(t.get("armedAt") or now)>max_seconds:
                    t["sawBetween"]=False;t["armedAt"]=now;t["anchorFy"]=t["fy"]
                return None
            if not t.get("sawBetween"):return None
            elapsed=now-float(t.get("armedAt") or now)
            travel=abs(float(t["fy"])-float(t.get("anchorFy") or t["fy"]))
            if elapsed>max_seconds or travel<min_travel:
                t["anchor"]=stable;t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"];return None
            is_entry=(anchor=="outside" and stable=="inside");is_exit=(anchor=="inside" and stable=="outside")
            if not (is_entry or is_exit):return None
            if is_entry:self.entries+=1
            else:self.exits+=1
            t["lastCountAt"]=now;t["anchor"]=stable;t["armedAt"]=now;t["sawBetween"]=False;t["anchorFy"]=t["fy"]
            return {"entry":is_entry,"trackId":tid,"appearance":t.get("appearance") or [],
                    "pid":t.get("pid"),"at":now,"travel":travel,"elapsed":elapsed,
                    "confidence":min(1.0,.75+min(.20,travel))}
        return None
    def update(self,people,now):
        events=[];ttl=float(self.cfg["doorTrackTtlSeconds"]);maxjump=float(self.cfg["doorMaxJump"])
        unmatched=set(range(len(people)))

        # Greedy assignment by motion + appearance. At a narrow doorway this is
        # materially safer than nearest-centre only when two customers overlap.
        pairs=[]
        for tid,t in self.tracks.items():
            for i in unmatched:
                cost,d,app=self._match_cost(people[i],t)
                if d<=maxjump:pairs.append((cost,d,-app,tid,i))
        used_t=set();used_i=set()
        for cost,d,negapp,tid,i in sorted(pairs):
            if tid in used_t or i in used_i:continue
            t=self.tracks.get(tid)
            if not t:continue
            p=people[i];used_t.add(tid);used_i.add(i)
            oldfy=float(t["fy"])
            t.update(fx=float(p["fx"]),fy=float(p["fy"]),cx=float(p["cx"]),cy=float(p["cy"]),
                     seen=now,frames=int(t["frames"])+1,pid=p.get("pid") or t.get("pid"))
            if p.get("appearance"):t["appearance"]=p["appearance"]
            t["travelTotal"]=float(t.get("travelTotal") or 0)+abs(float(t["fy"])-oldfy)
            stable=self._stable_zone(t,self._zone(t["fx"],t["fy"]))
            ev=self._transition(tid,t,stable,now)
            if ev:events.append(ev)

        for tid,t in list(self.tracks.items()):
            if tid not in used_t and now-float(t["seen"])>ttl:self.tracks.pop(tid,None)

        for i,p in enumerate(people):
            if i in used_i:continue
            z=self._zone(float(p["fx"]),float(p["fy"]))
            self.tracks[self.next]={"fx":float(p["fx"]),"fy":float(p["fy"]),"cx":float(p["cx"]),"cy":float(p["cy"]),
              "seen":now,"frames":1,"appearance":p.get("appearance") or [],"pid":p.get("pid"),
              "zoneRaw":z,"zoneStable":None,"zoneFrames":1,"anchor":None,"armedAt":now,
              "sawBetween":False,"anchorFy":float(p["fy"]),"lastCountAt":0.0,"travelTotal":0.0}
            self.next+=1
        return events


class DirectionalDoorFlowCounter:
    """Camera-8 doorway counter using directional optical flow inside a fixed ROI."""
    def __init__(self,cfg):
        self.cfg=cfg;self.prev=None;self.samples=[];self.entries=0;self.exits=0;self.lastCountAt=0.0
    def _roi(self,frame):
        h,w=frame.shape[:2]
        x1,y1,x2,y2=[float(v) for v in self.cfg.get("doorRoi",[.34,.24,.80,.99])]
        X1=max(0,min(w-2,int(x1*w)));X2=max(X1+2,min(w,int(x2*w)))
        Y1=max(0,min(h-2,int(y1*h)));Y2=max(Y1+2,min(h,int(y2*h)))
        return frame[Y1:Y2,X1:X2],(X1,Y1,X2,Y2)
    def _measurement(self,cv2,frame):
        roi,box=self._roi(frame)
        if roi.size==0:return None
        gray=cv2.cvtColor(roi,cv2.COLOR_BGR2GRAY)
        gray=cv2.GaussianBlur(gray,(5,5),0)
        if self.prev is None or self.prev.shape!=gray.shape:
            self.prev=gray;return None
        flow=cv2.calcOpticalFlowFarneback(self.prev,gray,None,.5,3,19,3,5,1.2,0)
        self.prev=gray
        fx=flow[:,:,0];fy=flow[:,:,1]
        mag=cv2.magnitude(fx,fy)
        import numpy as np
        vertical=np.abs(fy)/(np.abs(fx)+np.abs(fy)+1e-6)
        mask=(mag>=float(self.cfg.get("flowMinMagnitude",1.15))) & (vertical>=float(self.cfg.get("flowMinVerticalRatio",.58)))
        active=float(np.count_nonzero(mask))/max(1,mask.size)
        if active<float(self.cfg.get("flowMinActiveFraction",.006)):
            return {"active":active,"step":0.0,"cy":None}
        ys,xs=np.nonzero(mask)
        vals=fy[mask]
        step=float(np.median(vals)) if vals.size else 0.0
        weights=mag[mask]
        cy=float(np.average(ys,weights=weights))/max(1,gray.shape[0]-1) if len(ys) else None
        return {"active":active,"step":step,"cy":cy}
    def _consume(self,m,now):
        if not m or m.get("cy") is None:return None
        step=float(m.get("step") or 0)
        if abs(step)<float(self.cfg.get("flowMinStepPixels",.65)):return None
        direction=1 if step>0 else -1
        self.samples.append({"d":direction,"cy":float(m["cy"]),"step":step,"at":now})
        self.samples=self.samples[-max(3,int(self.cfg.get("flowWindow",7))):]
        need=int(self.cfg.get("flowVotesRequired",4))
        if len(self.samples)<need:return None
        votes=[x for x in self.samples if x["d"]==direction]
        if len(votes)<need:return None
        first,last=votes[0],votes[-1]
        travel=(last["cy"]-first["cy"])*direction
        if travel<float(self.cfg.get("flowMinCentroidTravel",.035)):return None
        if now-self.lastCountAt<float(self.cfg.get("flowCooldownSeconds",2.5)):return None
        self.lastCountAt=now;self.samples=[]
        is_entry=direction>0
        if is_entry:self.entries+=1
        else:self.exits+=1
        return {"entry":is_entry,"at":now,"travel":travel,
                "elapsed":max(0.0,last["at"]-first["at"]),
                "confidence":min(1.0,.78+min(.20,travel*2.0)),
                "motionCy":last["cy"]}
    def update(self,cv2,frame,now):
        return self._consume(self._measurement(cv2,frame),now)

def business_day_key(ts,cfg):
    dt=cairo_datetime(ts)
    hour=int(cfg.get("businessDayStartHour",6))
    if dt.hour<hour:dt-=timedelta(days=1)
    return dt.strftime("%Y-%m-%d")

class DoorOccupancy:
    """Persisted numeric occupancy survives detector restarts.

    The count is driven ONLY by completed directional doorway crossings. Visual person
    detections never raise occupancy, so mannequins cannot become customers.
    """
    def __init__(self,cfg):
        self.cfg=cfg;self.day=business_day_key(time.time(),cfg);self.count=0
        self.updatedAtMs=0;self.continuityCertain=True;self.lastEvent=""
        self._load()
    def _load(self):
        try:
            with open(OCCUPANCY_PATH,"r",encoding="utf-8") as f:x=json.load(f)
            if isinstance(x,dict) and x.get("businessDay")==self.day:
                self.count=max(0,int(x.get("customersInside") or 0))
                self.updatedAtMs=int(x.get("updatedAtMs") or 0)
                self.lastEvent=str(x.get("lastEvent") or "")
                # A long detector outage means crossings may have been missed.
                age=int(time.time()*1000)-self.updatedAtMs
                self.continuityCertain=bool(self.updatedAtMs and 0<=age<=120000)
        except Exception:
            self.count=0;self.continuityCertain=True
    def _save(self):
        try:
            tmp=OCCUPANCY_PATH+".tmp"
            with open(tmp,"w",encoding="utf-8") as f:
                json.dump({"version":662,"businessDay":self.day,"customersInside":self.count,
                           "updatedAtMs":self.updatedAtMs,"lastEvent":self.lastEvent},
                          f,separators=(",",":"))
            os.replace(tmp,OCCUPANCY_PATH)
        except Exception as e:log("occupancy_save_failed "+str(e))
    def force_zero(self,now,reason):
        """v720: visual evidence says the shop is empty - drop the drifted door count."""
        self.count=0;self.updatedAtMs=int(now*1000);self.lastEvent=reason;self._save()
    def roll_day(self,now):
        k=business_day_key(now,self.cfg)
        if k!=self.day:
            self.day=k;self.count=0;self.updatedAtMs=int(now*1000);self.lastEvent="business_day_reset";self.continuityCertain=True;self._save()
    def crossing(self,is_entry,is_staff,now):
        self.roll_day(now)
        if is_staff:
            self.lastEvent="staff_entry_ignored" if is_entry else "staff_exit_ignored"
            self.updatedAtMs=int(now*1000);self._save()
            return False
        if is_entry:
            self.count+=1;self.lastEvent="entry"
        else:
            if self.count<=0:
                self.count=0;self.lastEvent="exit_at_zero"
            else:
                self.count-=1;self.lastEvent="exit"
        self.updatedAtMs=int(now*1000);self._save()
        return True


class PersistentPersonGraph:
    def __init__(self,cfg):
        self.cfg=cfg
        self.next=1
        self.people={}
        self.camera_last={}
    def _new(self,cam,desc,now):
        pid="p"+str(self.next);self.next+=1
        self.people[pid]={"appearance":desc or [],"firstSeen":now,"lastSeen":now,
                          "lastCamera":int(cam),"inside":False,"staff":False,"seenCameras":[int(cam)]}
        return pid
    def _allowed(self,from_cam,to_cam):
        g=self.cfg.get("cameraGraph") or {}
        arr=g.get(str(from_cam),g.get(int(from_cam),[])) if isinstance(g,dict) else []
        return int(to_cam) in [int(x) for x in (arr or [])]
    def _score(self,person,desc,cam,now):
        app=_cosine(desc,person.get("appearance") or [])
        dt=max(0.0,now-float(person.get("lastSeen") or 0))
        same=(int(person.get("lastCamera") or -1)==int(cam))
        allowed=self._allowed(person.get("lastCamera"),cam)
        if same:bonus=.05
        elif allowed and dt<=float(self.cfg["handoffMaxSeconds"]):bonus=.08
        elif dt<=float(self.cfg["handoffMaxSeconds"]):bonus=.02
        else:bonus=0.0
        return app+bonus,app,dt,allowed
    def assign(self,cam,desc,now):
        best=None;bs=-1;meta=None
        for pid,p in self.people.items():
            sc,app,dt,allowed=self._score(p,desc,cam,now)
            if sc>bs:best=pid;bs=sc;meta=(app,dt,allowed)
        threshold=float(self.cfg["appearanceMatchThreshold"])
        strong=float(self.cfg["handoffStrongThreshold"])
        if best:
            app,dt,allowed=meta
            ok=(app>=strong) or (app>=threshold and (int(self.people[best]["lastCamera"])==int(cam) or (allowed and dt<=float(self.cfg["handoffMaxSeconds"]))))
            if ok:
                p=self.people[best]
                old=p.get("appearance") or []
                if old and desc and len(old)==len(desc):
                    p["appearance"]=[round(float(a)*.75+float(b)*.25,5) for a,b in zip(old,desc)]
                elif desc:p["appearance"]=desc
                p["lastSeen"]=now;p["lastCamera"]=int(cam)
                if int(cam) not in p["seenCameras"]:p["seenCameras"].append(int(cam))
                return best,False,app,dt,allowed
        pid=self._new(cam,desc,now)
        return pid,True,0.0,0.0,False
    def mark_inside(self,pid):
        if pid in self.people:self.people[pid]["inside"]=True
    def mark_outside(self,pid):
        if pid in self.people:self.people[pid]["inside"]=False
    def mark_staff(self,pid,is_staff=True):
        if pid in self.people:self.people[pid]["staff"]=bool(is_staff)
    def inside_people(self):
        return [p for p in self.people.values() if p.get("inside")]
    def inside_customers(self):
        return [p for p in self.people.values() if p.get("inside") and not p.get("staff")]
    def prune(self,now):
        ttl=float(self.cfg["identityRetentionHours"])*3600
        for pid,p in list(self.people.items()):
            if now-float(p.get("lastSeen") or 0)>ttl:self.people.pop(pid,None)

def run():
    import cv2,mediapipe as mp
    import numpy as np
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    os.makedirs(ROOT,exist_ok=True)
    with open(PID_PATH,"w",encoding="ascii") as f:f.write(str(os.getpid()))
    c=cfgload()
    detector=vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
      base_options=python.BaseOptions(model_asset_path=MODEL_PATH),
      score_threshold=float(c["scoreThreshold"]),max_results=20))
    door_detector=vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(
      base_options=python.BaseOptions(model_asset_path=MODEL_PATH),
      score_threshold=float(c.get("doorScoreThreshold",.15)),max_results=20))
    log("detector_v662_started aux_threshold=%.2f door_cam=%s door_threshold=%.2f"%(float(c["scoreThreshold"]),int(c["doorCamera"]),float(c.get("doorScoreThreshold",.15))))
    tracker=DirectionalDoorFlowCounter(c);occupancy=DoorOccupancy(c);caps={};last_state=0;last_nonzero=0;traffic=load_traffic();identities=IdentityBook(traffic,c);graph=PersistentPersonGraph(c);last_aux_detect=0;last_counts={cam:0 for cam in CAMERAS};last_online={cam:False for cam in CAMERAS}
    liveness=LivenessMonitor(c);corrector=EmptyStoreCorrector(c);empty_resets=0;last_empty_reset_ms=0
    while True:
        started=time.time();now_ms=int(started*1000);counts=dict(last_counts);online=dict(last_online);door_people=[];door_frame=None
        occupancy.roll_day(started)
        # Camera 8 is sampled much faster than auxiliary cameras so a normal walking
        # customer cannot jump over both virtual lines between samples.
        due_aux=(started-last_aux_detect)>=float(c["sampleSeconds"])
        scan=[int(c["doorCamera"])]
        if due_aux:scan += [cam for cam in CAMERAS if cam!=int(c["doorCamera"])]
        for cam in scan:
            cap=caps.get(cam)
            if cap is None or not cap.isOpened():
                if cap is not None:cap.release()
                cap=cv2.VideoCapture(STREAMS[cam],cv2.CAP_FFMPEG);cap.set(cv2.CAP_PROP_BUFFERSIZE,1);caps[cam]=cap
            ok,frame=cap.read() if cap.isOpened() else (False,None)
            if not ok:
                try:cap.release()
                except Exception:pass
                caps.pop(cam,None);online[cam]=False;counts[cam]=0;continue
            try:
                people=detect(door_detector if cam==int(c["doorCamera"]) else detector,mp,cv2,frame);online[cam]=True;counts[cam]=len(people)
                liveness.update(cv2,np,cam,frame,people,started)
                for person in people:
                    pid,is_new,app_sc,dt,allowed=graph.assign(cam,person.get("appearance") or [],started)
                    person["pid"]=pid
                if cam==int(c["doorCamera"]):door_people=people;door_frame=frame.copy()
            except Exception as e:
                log(f"detect_failed camera={cam} {e}");online[cam]=False;counts[cam]=0
        if due_aux:last_aux_detect=started
        last_counts=dict(counts);last_online=dict(online)
        staff=None
        try:
            staff=req("/echarpe-playback/staff-state")
            age=now_ms-int(staff.get("generatedAtMs") or 0)
            if not staff.get("ok") or age<0 or age>int(float(c["staffStateMaxAgeSeconds"])*1000):staff=None
        except Exception:staff=None
        staff_count=int(staff.get("activeStaffCount") or 0) if staff else 0

        # Non-biometric staff anchoring: people persistently seen on cashier camera 4 are tagged
        # as staff up to the active staff count reported by POS/Sales.
        if staff_count>0 and online.get(int(c.get("cashierCamera",4)),False):
            recent=[(pid,p) for pid,p in graph.people.items()
                    if int(p.get("lastCamera") or -1)==int(c.get("cashierCamera",4)) and started-float(p.get("lastSeen") or 0)<=3]
            recent=sorted(recent,key=lambda x:float(x[1].get("lastSeen") or 0),reverse=True)
            for i,(pid,pv) in enumerate(recent):
                graph.mark_staff(pid,i<staff_count)

        door_events=[]
        if online.get(int(c["doorCamera"]),False) and door_frame is not None:
            ev=tracker.update(cv2,door_frame,started)
            if ev:
                if door_people:
                    target=min(door_people,key=lambda p:abs(float(p.get("cy") or 0)-float(ev.get("motionCy") or 0)))
                    ev["pid"]=target.get("pid");ev["appearance"]=target.get("appearance") or []
                door_events=[ev]
        for ev in door_events:
            pid=ev.get("pid")
            person=graph.people.get(pid) if pid else None
            is_staff=bool(person and person.get("staff"))
            counted=occupancy.crossing(bool(ev["entry"]),is_staff,started)
            if not counted:
                log("door_staff_crossing_ignored pid=%s entry=%s"%(pid or "none",ev["entry"]))
                continue
            if ev["entry"]:
                iid,unique_delta,reid_score,duplicate_inside=identities.entry(ev.get("appearance") or [],started)
                if duplicate_inside:unique_delta=0
                if pid:graph.mark_inside(pid)
                add_crossing(traffic,True,started,unique_delta)
                log("roi_flow_entry pid=%s identity=%s unique=%s score=%.3f travel=%.3f elapsed=%.2f"%(pid or "none",iid,unique_delta,reid_score,float(ev.get("travel") or 0),float(ev.get("elapsed") or 0)))
            else:
                iid,reid_score=identities.exit(ev.get("appearance") or [],started)
                if pid:graph.mark_outside(pid)
                add_crossing(traffic,False,started,0)
                log("roi_flow_exit pid=%s identity=%s score=%.3f travel=%.3f elapsed=%.2f"%(pid or "none",iid or "unknown",reid_score,float(ev.get("travel") or 0),float(ev.get("elapsed") or 0)))

        # v720: self-correct the door count. If nobody alive is visible beyond the staff and the
        # cashier desk has been motionless, for the whole confirmation period, occupancy is 0.
        alive_total=liveness.alive_total(started)
        cashier_quiet=liveness.scene_quiet_seconds(int(c.get("cashierCamera",4)),started)
        if corrector.step(alive_total,(staff_count if staff is not None else None),liveness.cameras_reporting(started),cashier_quiet,started) and occupancy.count>0:
            log("visual_empty_reset from=%d alive=%d staff=%s cashierQuiet=%.0fs"%(occupancy.count,alive_total,(staff_count if staff is not None else "unknown"),min(cashier_quiet,99999)))
            occupancy.force_zero(started,"visual_empty_reset");empty_resets+=1;last_empty_reset_ms=now_ms
        all_online=sum(1 for v in online.values() if v)
        # IMPORTANT: do NOT derive customer occupancy from raw visual person counts.
        # Madinaty contains mannequin/display forms that person detectors can classify
        # as people. Only completed directional ROI doorway crossings change occupancy.
        customers=max(0,int(occupancy.count))
        if customers>0:last_nonzero=now_ms
        certain=bool(staff is not None and online.get(int(c["doorCamera"]),False) and occupancy.continuityCertain)
        zero_certain=bool(certain and customers==0)
        occupancy_certain=bool(certain)
        current=None
        if customers>0:
            current={"id":"mad_occ_%d"%(last_nonzero or now_ms),"active":True,"startedAtMs":last_nonzero or now_ms,
                     "lastPresenceAtMs":now_ms,"cameras":[k for k,v in online.items() if v],"confidence":1.0}
        state={"version":662,"generatedAtMs":now_ms,"attendanceFresh":staff is not None,
          "activeStaffCount":staff_count,"staffSource":str(staff.get("source") or "none") if staff else "none",
          "configuredCameras":list(CAMERAS),"onlineCameras":[k for k,v in online.items() if v],
          "cameraPeople":{str(k):counts.get(k,0) for k in CAMERAS},"doorCamera":int(c["doorCamera"]),
          "doorMode":"roi_directional_flow","doorInsideLine":c["doorInsideLine"],"doorOutsideLine":c["doorOutsideLine"],"doorRoi":c.get("doorRoi"),
          "doorEntries":tracker.entries,"doorExits":tracker.exits,"doorOccupancy":customers,
          "identityInsideCount":len(identities.inside),"persistentInsideCount":len(graph.inside_people()),
          "persistentCustomerCount":len(graph.inside_customers()),"visualCustomerFloor":0,"customersInside":customers,
          "occupancyCertain":occupancy_certain,"zeroCertain":zero_certain,
          "continuityCertain":bool(occupancy.continuityCertain),"occupancyBusinessDay":occupancy.day,
          "occupancyLastEvent":occupancy.lastEvent,"occupancyUpdatedAtMs":occupancy.updatedAtMs,
          "current":current,"lastCustomerAtMs":last_nonzero,
          "lastCustomerExitAtMs":identities.last_exit_ms,"lastCustomerExitIdentity":identities.last_exit_id,
          "trafficTimezone":"Africa/Cairo","trafficRetentionDays":TRAFFIC_RETENTION_DAYS,
          "trafficHistory":traffic_history(traffic,31),"trackingMode":"camera8_roi_directional_flow_persistent_handoff",
          "countingAuthority":"camera8_roi_directional_optical_flow","rawVisualCountsExcludedFromOccupancy":True,
          "handoffGraph":c.get("cameraGraph") or {},
          "livenessVersion":720,"alivePeople":alive_total,"emptyHeldSeconds":int(corrector.held_seconds(started)),
          "emptyResets":empty_resets,"lastEmptyResetAtMs":last_empty_reset_ms}
        if now_ms-last_state>=2000:
            try:req("/echarpe-playback/activity-state",state)
            except Exception:pass
            last_state=now_ms
        time.sleep(max(0,float(c["doorSampleSeconds"])-(time.time()-started)))
if __name__=="__main__":
    run()
