(()=>{
const cfg=window.BARBEARIA_CONFIG||{};
const $=id=>document.getElementById(id);
const dbAtivo=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey&&window.supabase);
const db=dbAtivo?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let servicos=[];let barbeiros=[];
const hoje=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const telLimpo=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
const telBR=v=>{const n=telLimpo(v).slice(0,11);if(n.length<=2)return n;if(n.length<=7)return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3)}`;return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}`};
function msg(texto,tipo='ok'){const el=$('mensagem');if(!el)return;el.textContent=texto;el.className=`mensagem ${tipo}`}
function minutos(h){const [hh,mm]=h.split(':').map(Number);return hh*60+mm}
function hora(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
async function carregarCatalogo(){
  if(dbAtivo){
    try{
      const [s,b]=await Promise.all([
        db.from('servicos').select('id,nome,duracao_minutos,valor').eq('ativo',true).order('ordem'),
        db.from('barbeiros').select('id,nome').eq('ativo',true).order('nome')
      ]);
      if(!s.error&&s.data?.length)servicos=s.data.map(x=>({id:x.id,nome:x.nome,duracao:x.duracao_minutos,valor:x.valor}));
      if(!b.error&&b.data?.length)barbeiros=b.data;
    }catch(e){console.warn('Catálogo remoto indisponível',e)}
  }
  if(!servicos.length)servicos=cfg.servicosPadrao||[];
  if(!barbeiros.length)barbeiros=cfg.barbeirosPadrao||[];
  $('servicoSelect').innerHTML=servicos.map(s=>`<option value="${s.id}">${s.nome} • ${s.duracao} min • ${moeda(s.valor)}</option>`).join('');
  $('barbeiroSelect').innerHTML=barbeiros.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');
}
async function horariosOcupados(){
  if(!dbAtivo)return new Set();
  try{
    const data=$('dataAgendamento').value,barbeiro=$('barbeiroSelect').value;
    if(!data||!barbeiro)return new Set();
    const r=await db.from('agendamentos').select('hora').eq('data',data).eq('barbeiro_id',barbeiro).in('status',['pendente','confirmado','em_atendimento']);
    return r.error?new Set():new Set((r.data||[]).map(x=>String(x.hora).slice(0,5)));
  }catch{return new Set()}
}
async function gerarHorarios(){
  const select=$('horaSolicitada');if(!select)return;
  const ocupados=await horariosOcupados();const ini=minutos(cfg.inicio||'08:30');const fim=minutos(cfg.fim||'20:00');const passo=Number(cfg.intervalo||30);const data=$('dataAgendamento').value;const agora=new Date();const lista=[];
  for(let m=ini;m<=fim;m+=passo){const h=hora(m);if(ocupados.has(h))continue;if(data===hoje()){const [hh,mm]=h.split(':').map(Number);const alvo=new Date();alvo.setHours(hh,mm,0,0);if(alvo.getTime()<agora.getTime()+20*60000)continue}lista.push(h)}
  select.innerHTML=lista.length?lista.map(h=>`<option value="${h}">${h}</option>`).join(''):'<option value="">Sem horários disponíveis</option>';
}
function mensagemWhatsApp(d){
  const serv=servicos.find(s=>String(s.id)===String(d.servico));const barb=barbeiros.find(b=>String(b.id)===String(d.barbeiro));
  return `Olá! Gostaria de agendar na ${cfg.nome}.\n\nCliente: ${d.nome}\nWhatsApp: ${d.telefone}\nServiço: ${serv?.nome||d.servico}\nBarbeiro: ${barb?.nome||d.barbeiro}\nData: ${d.data.split('-').reverse().join('/')}\nHorário: ${d.hora}${d.obs?`\nObservação: ${d.obs}`:''}\n\nPode confirmar este horário para mim?`;
}
function abrirWhatsApp(texto){const numero=String(cfg.whatsapp||'').replace(/\D/g,'');window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,'_blank','noopener')}
async function salvarBanco(d){
  const telefone=telLimpo(d.telefone);const serv=servicos.find(s=>String(s.id)===String(d.servico));
  const c=await db.from('clientes').upsert({telefone,nome:d.nome},{onConflict:'telefone'});if(c.error)throw c.error;
  const a=await db.from('agendamentos').insert({cliente_telefone:telefone,barbeiro_id:d.barbeiro,servico_id:d.servico,data:d.data,hora:d.hora,valor:Number(serv?.valor||0),observacao:d.obs||null,status:'pendente'});if(a.error)throw a.error;
}
async function enviar(e){
  e.preventDefault();const btn=$('btnAgendar');const dados={nome:$('clienteNome').value.trim(),telefone:$('clienteTelefone').value.trim(),servico:$('servicoSelect').value,barbeiro:$('barbeiroSelect').value,data:$('dataAgendamento').value,hora:$('horaSolicitada').value,obs:$('observacao').value.trim()};
  if(!dados.nome||telLimpo(dados.telefone).length<10||!dados.servico||!dados.barbeiro||!dados.data||!dados.hora){msg('Confira os dados antes de continuar.','erro');return}
  btn.disabled=true;const original=btn.innerHTML;btn.textContent='Enviando...';
  try{
    if(dbAtivo){await salvarBanco(dados);msg('Solicitação registrada. A barbearia fará a confirmação pelo WhatsApp.','ok');abrirWhatsApp(mensagemWhatsApp(dados));await gerarHorarios()}
    else{msg('Abrindo o WhatsApp para concluir seu agendamento.','ok');abrirWhatsApp(mensagemWhatsApp(dados))}
  }catch(err){console.error(err);msg('O banco está temporariamente indisponível. Vamos concluir pelo WhatsApp.','warn');abrirWhatsApp(mensagemWhatsApp(dados))}
  finally{btn.disabled=false;btn.innerHTML=original}
}
function prepararTela(){
  $('dataAgendamento').min=hoje();$('dataAgendamento').value=hoje();$('textoEndereco').textContent=cfg.endereco||'';$('footerEndereco').textContent=cfg.endereco||'';
  $('linkWhatsappTopo').href=`https://wa.me/${String(cfg.whatsapp||'').replace(/\D/g,'')}`;$('linkRota').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.endereco||cfg.nome||'')}`;
  $('clienteTelefone').addEventListener('input',e=>e.target.value=telBR(e.target.value));$('dataAgendamento').addEventListener('change',gerarHorarios);$('barbeiroSelect').addEventListener('change',gerarHorarios);$('formAgendamento').addEventListener('submit',enviar);
  if(!dbAtivo){$('statusSistema').textContent='Agendamento via WhatsApp';$('statusDetalhe').textContent='O novo banco está sendo preparado. Seu pedido já pode ser enviado normalmente.'}
}
window.addEventListener('DOMContentLoaded',async()=>{prepararTela();await carregarCatalogo();await gerarHorarios()});
})();