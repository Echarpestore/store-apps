/* Tesseract OCR runs on-device; engine/data downloads on first use. Fail closed. */
import {inspectReceiptText} from './live-receipt-core.js?v=686';
let promise;
function loadLibrary(){return new Promise((resolve,reject)=>{
 if(window.Tesseract?.createWorker){resolve(window.Tesseract);return;}
 const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.async=true;
 script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('OCR unavailable'));
 script.onerror=()=>reject(Error('OCR download failed'));document.head.appendChild(script);
 });}
async function worker(){if(!promise)promise=loadLibrary().then(lib=>lib.createWorker('eng+ara',1));return promise;}
export async function readLiveFrame(video,details){
 const w=1000,h=Math.round(w*video.videoHeight/video.videoWidth);if(!Number.isFinite(h)||h<200)throw Error('Camera not ready');
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,w,h);
 const engine=await worker();const output=await engine.recognize(canvas);
 return inspectReceiptText(output.data.text,details);
}
