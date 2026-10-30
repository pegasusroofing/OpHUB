// Phones can't draw a PDF page themselves: pdf.js runs in a hidden web view and hands
// back a picture of each page, which the signature-box editor shows and draws over.
import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { Image, Text, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { fetchBytes } from '@/lib/pdf';
import { base } from '@/theme/theme';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const HTML = `<!doctype html><html><body><canvas id="c"></canvas><script src="${PDFJS}pdf.min.js"></script><script>
var doc = null;
function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function fail(e){ send({t:'err', m:String((e && e.message) || e)}); }
window.openPdf = function(b64){
  var bin = atob(b64), u = new Uint8Array(bin.length);
  for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  pdfjsLib.getDocument({data:u, isEvalSupported:false}).promise.then(function(d){ doc = d; send({t:'open', n:d.numPages}); }).catch(fail);
};
window.showPage = function(n){
  if(!doc) return;
  doc.getPage(n).then(function(pg){
    var b = pg.getViewport({scale:1}), vp = pg.getViewport({scale:Math.min(3, 1400 / b.width)}), c = document.getElementById('c');
    c.width = vp.width; c.height = vp.height;
    return pg.render({canvasContext:c.getContext('2d'), viewport:vp}).promise.then(function(){ send({t:'page', n:n, uri:c.toDataURL('image/jpeg', 0.8), w:vp.width, h:vp.height}); });
  }).catch(fail);
};
window.addEventListener('load', function(){
  if(!window.pdfjsLib){ send({t:'err', m:'The PDF reader failed to load — check your connection.'}); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}pdf.worker.min.js';
  send({t:'ready'});
});
</script></body></html>`;

type Web = { injectJavaScript: (js: string) => void };
// The package's class types don't line up with this React version's.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<Web> }>;
type Shot = { uri: string; w: number; h: number };
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

export function NativePdfPage({ url, page, onPages, onError }: { url: string; page: number; onPages: (n: number) => void; onError: (m: string) => void }) {
  const web = useRef<Web>(null);
  const [opened, setOpened] = useState(false);
  const [shots, setShots] = useState<Record<number, Shot>>({});
  const shot = shots[page];
  useEffect(() => { if (opened && !shot) web.current?.injectJavaScript(`showPage(${page});true;`); }, [opened, page, shot]);
  const onMessage = async (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { t: string; n?: number; m?: string; uri?: string; w?: number; h?: number };
    if (m.t === 'ready') {
      const bytes = await fetchBytes(url);
      if (!bytes) { onError('Could not open this document.'); return; }
      web.current?.injectJavaScript(`openPdf(${JSON.stringify(b64(bytes))});true;`);
    } else if (m.t === 'open') { onPages(m.n || 0); setOpened(true); }
    else if (m.t === 'page') setShots((x) => ({ ...x, [m.n as number]: { uri: m.uri as string, w: m.w as number, h: m.h as number } }));
    else if (m.t === 'err') onError(`Could not open this document — it needs to be a PDF. ${m.m || ''}`);
  };
  return (
    <View>
      <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} pointerEvents="none">
        <WebView ref={web} originWhitelist={['*']} source={{ html: HTML, baseUrl: 'https://localhost/' }} onMessage={(e) => void onMessage(e)} style={{ width: 1, height: 1 }} />
      </View>
      {shot
        ? <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: shot.w / shot.h }} resizeMode="contain" />
        : <View style={{ height: 320, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: base.slate }}>Loading the page…</Text></View>}
    </View>
  );
}
