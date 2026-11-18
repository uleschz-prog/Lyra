// Entrega 3: script que LYRA agrega a los sitios publicados en /s/[slug] para recibir sus formularios.
// Escucha los envíos (también los de sitios ya generados, sin tocarlos) y manda los campos al
// endpoint de contactos. La pantalla del sitio sigue mostrando su propia confirmación y su botón
// de WhatsApp; si el envío falla, el visitante no ve ningún error nuevo.

/** Ruta del endpoint público de contactos de un sitio. */
export function leadEndpointPath(slug: string) {
  return `/api/s/${slug}/contacto`;
}

export function leadRuntimeScript(endpoint: string) {
  const code = `(function(){
var E=${JSON.stringify(endpoint)},T=Date.now(),last="",lastAt=0,formAt=0;
var hp=document.createElement("input");hp.type="text";hp.name="lyra_hp";hp.tabIndex=-1;hp.autocomplete="off";hp.setAttribute("aria-hidden","true");
hp.style.cssText="position:absolute;left:-10000px;top:auto;width:1px;height:1px;opacity:0";
(document.body||document.documentElement).appendChild(hp);
function text(n){return (n&&n.textContent||"").replace(/\\s+/g," ").trim()}
function label(el){var l=el.getAttribute("aria-label");if(l)return l;if(el.labels&&el.labels[0])return text(el.labels[0]);
var w=el.closest("label");if(w)return text(w);return el.getAttribute("placeholder")||el.name||el.id||el.type||"Campo"}
function collect(f){var out=[],els=f.elements;for(var i=0;i<els.length;i++){var el=els[i],t=(el.type||"").toLowerCase();
if(!el.name&&!el.id&&!el.getAttribute("aria-label")&&!el.getAttribute("placeholder")&&!(el.labels&&el.labels.length)&&!el.closest("label"))continue;
if(/^(submit|button|reset|image|file|password|hidden)$/.test(t)||el.disabled)continue;
var v;if(t==="checkbox"){if(!el.checked)continue;v=el.value&&el.value!=="on"?el.value:"Sí"}else if(t==="radio"){if(!el.checked)continue;v=el.value}else{v=el.value}
v=String(v==null?"":v).trim();if(v)out.push({label:String(label(el)).slice(0,60),value:v.slice(0,2000)})}return out}
function send(fields){if(!fields.length)return;var body=JSON.stringify({fields:fields,hp:hp.value,page:String(location.hash||"/").slice(0,120),t:Date.now()-T});
var key=JSON.stringify(fields);if(key===last&&Date.now()-lastAt<5000)return;last=key;lastAt=Date.now();
try{fetch(E,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:body,keepalive:true,credentials:"omit"}).catch(function(){})}catch(e){}}
document.addEventListener("submit",function(ev){var f=ev.target;if(!f||f.tagName!=="FORM"||f.getAttribute("role")==="search"||f.hasAttribute("data-lyra-lead"))return;var c=collect(f);if(c.length){formAt=Date.now();send(c)}},true);
document.addEventListener("lyra:lead",function(ev){if(Date.now()-formAt<3000)return;var d=ev.detail||{},out=[];for(var k in d){if(Object.prototype.hasOwnProperty.call(d,k)&&d[k]!=null&&String(d[k]).trim())out.push({label:String(k).slice(0,60),value:String(d[k]).trim().slice(0,2000)})}send(out)});
})();`;
  return `<script>${code.replace(/<\/script/gi, "<\\/script")}</script>`;
}
