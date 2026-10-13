import numpy as np, wave, sys
SR=44100; D=56.0; N=int(SR*D)
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)
def n2f(n): return 440*2**((n-69)/12)
def add(sig,t0,gain=1.0,pan=0.0):
    i=int(t0*SR); j=min(N,i+len(sig)); s=sig[:j-i]*gain
    L[i:j]+=s*(1-pan)*0.5**0.5*1.4 if False else s*np.sqrt((1-pan)/2)*1.41
    R[i:j]+=s*np.sqrt((1+pan)/2)*1.41
def env(n,a,r):
    e=np.ones(n); A=int(a*SR); Rr=int(r*SR)
    e[:A]=np.linspace(0,1,A); e[-Rr:]*=np.linspace(1,0,Rr); return e
def fftfilt(x,lo,hi):
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/SR); X[(f<lo)|(f>hi)]=0; return np.fft.irfft(X,len(x))
BPM=96; B=60/BPM
# progression (MIDI): Fmaj7, Am7, Dm9, Cmaj7/E ... each 2 bars (8 beats)
prog=[[53,57,60,64],[57,60,64,67],[50,57,60,64,65],[52,55,59,64]]
bar8=8*B
music=np.zeros(N)
t=0.0; k=0
while t<D:
    ch=prog[k%4]; dur=bar8
    n=int(dur*SR)+int(1.5*SR); tt=np.arange(n)/SR
    pad=np.zeros(n)
    for m in ch:
        for det in (-0.12,0.12):
            f=n2f(m+det/1.0)
            pad+=np.sin(2*np.pi*f*tt)+0.25*np.sin(2*np.pi*2*f*tt+.3)
    pad*=env(n,1.2,1.6)*0.022
    add(pad,t,1.0)
    # bass
    bf=n2f(ch[0]-12); bs=np.sin(2*np.pi*bf*tt)*env(n,0.3,1.2)*0.08
    add(bs,t)
    # arpeggio 8ths
    arp=[ch[0]+12,ch[1]+12,ch[2]+12,ch[-1]+12,ch[2]+12,ch[1]+12,ch[2]+12,ch[-1]+12]
    for s in range(16):
        st=t+s*B/2
        if st>=D: break
        m=arp[s%8]; f=n2f(m); ln=int(1.2*SR); x=np.arange(ln)/SR
        pl=(np.sin(2*np.pi*f*x)+.35*np.sin(2*np.pi*2*f*x)+.12*np.sin(2*np.pi*3*f*x))*np.exp(-x*4.5)
        pl[:60]*=np.linspace(0,1,60)
        add(pl,st,0.05*(1 if s%2==0 else .7),pan=(0.35 if s%2 else -0.35))
    t+=bar8; k+=1
# drums (start after intro at 4s, drop 30-36.6 privacy to lighter)
for b in range(int(D/B)):
    st=b*B
    if st<3.8 or st>53.8: continue
    light = False
    if b%2==0 and not light:
        ln=int(.4*SR); x=np.arange(ln)/SR; f=50+90*np.exp(-x*30)
        kick=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-x*9); add(kick,st,0.28)
    hl=int(.06*SR); h=rng.standard_normal(hl)*np.exp(-np.arange(hl)/SR*80)
    h=fftfilt(np.pad(h,(0,2000)),7000,16000)
    add(h,st+B/2,0.05 if not light else .03,pan=.3)
    if b%4==2 and not light:
        cl=int(.25*SR); c=rng.standard_normal(cl)*np.exp(-np.arange(cl)/SR*22); c=fftfilt(c,900,5000); add(c,st,0.07)
# reverb on everything so far
ir_n=int(2.2*SR); ir=rng.standard_normal(ir_n)*np.exp(-np.arange(ir_n)/SR*2.6); ir[0]=0; ir/=np.sqrt((ir**2).sum())
def conv(x): 
    n=len(x)+len(ir); n2=1<<(n-1).bit_length()
    return np.fft.irfft(np.fft.rfft(x,n2)*np.fft.rfft(ir,n2),n2)[:len(x)]
L=L+conv(L)*0.35; R=R+conv(R)*0.35
mL,mR=L.copy(),R.copy(); L[:]=0; R[:]=0
# master fade
fade=np.ones(N); fade[:int(1.5*SR)]=np.linspace(0,1,int(1.5*SR)); fade[-int(3*SR):]=np.linspace(1,0,int(3*SR))
mL*=fade; mR*=fade
# ---- SFX ----
def tap():
    ln=int(.05*SR); x=np.arange(ln)/SR
    return (np.sin(2*np.pi*1700*x)*np.exp(-x*120)+rng.standard_normal(ln)*np.exp(-x*300)*.3)
def pop():
    ln=int(.12*SR); x=np.arange(ln)/SR; f=700+700*x/.12
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-x*30)
def whoosh(d=.8):
    ln=int(d*SR); x=np.linspace(0,1,ln); e=np.sin(np.pi*x)**2
    nz=fftfilt(rng.standard_normal(ln),250,4000); return nz*e/np.abs(nz).max()
def chime(notes):
    out=np.zeros(int(2*SR))
    for i,m in enumerate(notes):
        f=n2f(m); ln=int(1.6*SR); x=np.arange(ln)/SR
        s=(np.sin(2*np.pi*f*x)+.4*np.sin(2*np.pi*2.01*f*x))*np.exp(-x*3)
        o=int(i*.09*SR); out[o:o+ln]+=s[:len(out)-o]
    return out
def boom():
    ln=int(2.5*SR); x=np.arange(ln)/SR
    b=np.sin(2*np.pi*(45+30*np.exp(-x*4))*x)*np.exp(-x*2.2)
    sh=fftfilt(rng.standard_normal(ln),5000,14000)*np.exp(-x*1.5)*.15
    return b+sh
S=np.zeros(N)
def sadd(sig,t0,g):
    i=int(t0*SR); j=min(N,i+len(sig)); S[i:j]+=sig[:j-i]*g
for t0 in [20.6,22.2,24.4,32.1,33.9]: sadd(tap(),t0-.02,.35)
for t0 in [6.4,13.2,13.7,14.2,26.0,28.2,40.8,41.15,41.5,41.85,46.2,46.7]: sadd(pop(),t0,.2)
for t0 in [3.55,51.05]: sadd(whoosh(.9),t0,.22)
for t0 in [4.2,17.2,32.35,34.3,34.7,40.0]: sadd(whoosh(.6),t0,.12)
sadd(chime([79,84,88]),11.6,.12); sadd(chime([84,88,91,96]),12.3,.14)
for i in range(7): sadd(chime([96+(i%3)*2]),26.6+i*.08,.05)
sadd(chime([88,91,96]),27.3,.12); sadd(chime([84,88,91,96]),34.0,.14)
sadd(boom(),0.3,.45); sadd(boom(),51.8,.45)
Sr=conv(S)*0.25+S
L=mL*0.9+Sr; R=mR*0.9+Sr
pk=max(np.abs(L).max(),np.abs(R).max()); L/=pk/0.89; R/=pk/0.89
st=np.stack([L,R],1); st=(st*32767).astype(np.int16)
w=wave.open(sys.argv[1],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes()); w.close()
