/*=========================================================
001 VARIÁVEIS GLOBAIS
=========================================================*/
let painelProprietario=false
let servicosCache=[]
/*=========================================================
002 SAFE
=========================================================*/
function safe(id){
return document.getElementById(id)
}
/*=========================================================
003 DATA HOJE
=========================================================*/
function dataHoje(){
return new Date().toISOString().slice(0,10)
}
/*=========================================================
004 FORMATAR HORA
=========================================================*/
function formatarHora(h){
if(!h)return''
return String(h).slice(0,5)
}
/*=========================================================
005 ALTERNAR PAINEL
=========================================================*/
function alternarPainel(){
if(!painelProprietario){
if(localStorage.getItem('barbearia_admin')!=='SIM'){
safe('loginAdmin').classList.remove('hidden')
return
}
}
painelProprietario=!painelProprietario
safe('loginAdmin').classList.add('hidden')
safe('viewCliente').classList.toggle('hidden',painelProprietario)
safe('viewProprietario').classList.toggle('hidden',!painelProprietario)
safe('btnPainel').innerText=painelProprietario?'App Cliente':'Painel Proprietário'
if(painelProprietario)carregarPainel()
}
/*=========================================================
006 CARREGAR SERVIÇOS
=========================================================*/
async function carregarServicos(){
let {data,error}=await client.from('servicos').select('*').eq('ativo',true).order('nome')
if(error)return alert('Erro ao carregar serviços')
servicosCache=data||[]
safe('servicoSelect').innerHTML=servicosCache.map(s=>`<option value="${s.id}">${s.nome} - ${s.duracao_minutos} min - R$ ${Number(s.valor).toFixed(2)}</option>`).join('')
}
/*=========================================================
007A CARREGAR BARBEIROS
=========================================================*/
async function carregarBarbeiros(){
let {data,error}=await client.from('barbeiros').select('*').eq('ativo',true).order('nome')
if(error)return
safe('barbeiroSelect').innerHTML=(data||[]).map(b=>`<option value="${b.id}">${b.nome}</option>`).join('')
}
/*=========================================================
007 SOLICITAR AGENDAMENTO
=========================================================*/
async function solicitarAgendamento(){
let barbeiro_id=safe('barbeiroSelect').value
let nome=safe('clienteNome').value.trim()
let telefone=safe('clienteTelefone').value.trim()
let servico_id=safe('servicoSelect').value
let data_agendamento=safe('dataAgendamento').value
let hora_solicitada=safe('horaSolicitada').value
if(!nome||!telefone||!servico_id||!data_agendamento||!hora_solicitada)return alert('Preencha todos os campos')
let {data:cli,error:erroCli}=await client.from('clientes').insert({nome,telefone}).select().single()
if(erroCli)return alert('Erro ao cadastrar cliente')
let {error}=await client.from('agendamentos').insert({
cliente_id:cli.id,
barbeiro_id,
servico_id,
data_agendamento,
hora_solicitada,
status:'aguardando'
})
if(error)return alert('Erro ao solicitar agendamento')
safe('retornoCliente').innerHTML='Solicitação enviada. Aguarde o aceite do salão.'
await gerarHorarios()
safe('telefoneBusca').value=telefone
acompanharCliente()
}
/*=========================================================
008 ACOMPANHAR CLIENTE
=========================================================*/
async function acompanharCliente(){
let telefone=safe('telefoneBusca').value.trim()
if(!telefone)return alert('Informe o WhatsApp')
let {data,error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome,duracao_minutos,valor)').eq('clientes.telefone',telefone).order('data_agendamento',{ascending:false}).order('hora_solicitada',{ascending:false})
if(error)return alert('Erro ao buscar agendamento')
renderCliente(data||[])
}
/*=========================================================
009 RENDER CLIENTE
=========================================================*/
function renderCliente(lista){
if(!lista.length){
safe('listaCliente').innerHTML='<div class="itemAgenda">Nenhum agendamento encontrado.</div>'
return
}
safe('listaCliente').innerHTML=lista.map(a=>{
let tempo=calcularTextoTempo(a)
return `<div class="itemAgenda"><h4>${a.servicos?.nome||''}</h4><p>Cliente: ${a.clientes?.nome||''}</p><p>Data: ${a.data_agendamento}</p><p>Horário solicitado: ${formatarHora(a.hora_solicitada)}</p><p>Horário previsto: ${formatarHora(a.hora_prevista)||'aguardando aceite'}</p><p>Status: <strong>${a.status}</strong></p><p>${tempo}</p></div>`
}).join('')
}
/*=========================================================
010 CALCULAR TEXTO TEMPO
=========================================================*/
function calcularTextoTempo(a){
if(a.status==='aguardando')return'Aguardando confirmação do salão.'
if(a.status==='recusado')return'Agendamento recusado pelo salão.'
if(a.status==='finalizado')return'Atendimento finalizado.'
if(a.status==='em_atendimento')return'Você está em atendimento.'
if(!a.hora_prevista)return'Horário previsto ainda não calculado.'
let agora=new Date()
let alvo=new Date(`${a.data_agendamento}T${formatarHora(a.hora_prevista)}:00`)
let min=Math.round((alvo-agora)/60000)
if(min>0)return`Faltam aproximadamente ${min} minutos para seu atendimento.`
if(min>-20)return'Seu horário está chegando. Dirija-se ao salão.'
return'O horário previsto já passou. Consulte o salão.'
}
/*=========================================================
011 CARREGAR PAINEL
=========================================================*/
async function carregarPainel(){
let data=safe('dataPainel').value||dataHoje()
safe('dataPainel').value=data
let {data:lista,error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome,duracao_minutos,valor)').eq('data_agendamento',data).order('hora_solicitada',{ascending:true})
if(error)return alert('Erro ao carregar painel')
renderPainel(lista||[])
carregarAgendaSemanal()
carregarRecepcao()

}
/*=========================================================
012 RENDER PAINEL
=========================================================*/
function renderPainel(lista){
safe('kpiAguardando').innerText=lista.filter(a=>a.status==='aguardando').length
safe('kpiAceitos').innerText=lista.filter(a=>a.status==='aceito'||a.status==='confirmado'||a.status==='proximo').length
safe('kpiAtendimento').innerText=lista.filter(a=>a.status==='em_atendimento').length
safe('kpiFinalizados').innerText=lista.filter(a=>a.status==='finalizado').length
if(!lista.length){
safe('listaPainel').innerHTML='<div class="itemAgenda">Nenhum agendamento para esta data.</div>'
return
}
safe('listaPainel').innerHTML=lista.map(a=>`<div class="itemAgenda"><h4>${formatarHora(a.hora_solicitada)} - ${a.clientes?.nome||''}</h4><p>WhatsApp: ${a.clientes?.telefone||''}</p><p>Serviço: ${a.servicos?.nome||''} - ${a.servicos?.duracao_minutos||0} min</p><p>Status: <strong>${a.status}</strong></p><p>Horário previsto: ${formatarHora(a.hora_prevista)||'não definido'}</p><div class="botoes">${botoesPainel(a)}</div></div>`).join('')
}
/*=========================================================
013 BOTÕES PAINEL
=========================================================*/
function botoesPainel(a){
let html=''
if(a.status==='aguardando')html+=`<button class="btnAceitar" onclick="aceitarAgendamento('${a.id}')">Aceitar</button><button class="btnRecusar" onclick="alterarStatus('${a.id}','recusado')">Recusar</button>`
if(a.status==='aceito'||a.status==='confirmado'||a.status==='proximo')html+=`<button class="btnAtender" onclick="alterarStatus('${a.id}','em_atendimento')">Iniciar</button>`
if(a.status==='em_atendimento')html+=`<button class="btnFinalizar" onclick="alterarStatus('${a.id}','finalizado')">Finalizar</button>`
return html
}
/*=========================================================
014 ACEITAR AGENDAMENTO
=========================================================*/
async function aceitarAgendamento(id){
let data=safe('dataPainel').value||dataHoje()
let {data:lista,error}=await client.from('agendamentos').select('*,servicos(duracao_minutos)').eq('data_agendamento',data).in('status',['aceito','confirmado','proximo','em_atendimento']).order('hora_prevista',{ascending:true})
if(error)return alert('Erro ao calcular fila')
let ag=await buscarAgendamento(id)
let hora=calcularProximaHora(lista||[],ag)
let {error:erro}=await client.from('agendamentos').update({status:'aceito',hora_prevista:hora}).eq('id',id)
if(erro)return alert('Erro ao aceitar')
carregarPainel()
}
/*=========================================================
015 BUSCAR AGENDAMENTO
=========================================================*/
async function buscarAgendamento(id){
let {data,error}=await client.from('agendamentos').select('*,servicos(duracao_minutos)').eq('id',id).single()
if(error)return null
return data
}
/*=========================================================
016 CALCULAR PRÓXIMA HORA
=========================================================*/
function calcularProximaHora(lista,ag){
if(!lista.length)return formatarHora(ag.hora_solicitada)
let ultimo=lista[lista.length-1]
let base=new Date(`${ultimo.data_agendamento}T${formatarHora(ultimo.hora_prevista||ultimo.hora_solicitada)}:00`)
let duracao=ultimo.servicos?.duracao_minutos||30
base.setMinutes(base.getMinutes()+duracao)
return base.toTimeString().slice(0,5)
}
/*=========================================================
017 ALTERAR STATUS
=========================================================*/
async function alterarStatus(id,status){
let {error}=await client.from('agendamentos').update({status}).eq('id',id)
if(error)return alert('Erro ao alterar status')
carregarPainel()
carregarRecepcao()
}
/*=========================================================
018 INICIAR SISTEMA
=========================================================*/
window.addEventListener('load',async()=>{
safe('dataAgendamento').value=dataHoje()
safe('dataPainel').value=dataHoje()
await carregarServicos()
await carregarBarbeiros()
await gerarHorarios()
safe('dataAgendamento').addEventListener('change',gerarHorarios)
safe('barbeiroSelect').addEventListener('change',gerarHorarios)
setInterval(carregarRecepcao,10000)
})
/*=========================================================
019 GERAR HORARIOS
=========================================================*/
async function gerarHorarios(){
let data=safe('dataAgendamento').value||dataHoje()
let barbeiro_id=safe('barbeiroSelect')?.value||''
let {data:agenda=[]}=await client.from('agendamentos').select('hora_solicitada,status,barbeiro_id').eq('data_agendamento',data).eq('barbeiro_id',barbeiro_id).neq('status','cancelado')
let ocupados=agenda.map(a=>String(a.hora_solicitada).slice(0,5))
let html=''
for(let h=8;h<=20;h++){
if(h===8){
let hora='08:30'
if(!ocupados.includes(hora))html+=`<option value="${hora}">${hora}</option>`
continue
}
if(h<20){
let h1=`${String(h).padStart(2,'0')}:00`
let h2=`${String(h).padStart(2,'0')}:30`
if(!ocupados.includes(h1))html+=`<option value="${h1}">${h1}</option>`
if(!ocupados.includes(h2))html+=`<option value="${h2}">${h2}</option>`
}else{
let hora='20:00'
if(!ocupados.includes(hora))html+=`<option value="${hora}">${hora}</option>`
}
}
safe('horaSolicitada').innerHTML=html
}
/*=========================================================
020 LOGIN ADMIN
=========================================================*/
async function entrarAdmin(){
let login=safe('loginUsuario').value.trim()
let senha=safe('senhaUsuario').value.trim()
let {data,error}=await client.from('usuarios').select('*').eq('login',login).eq('senha',senha).eq('ativo',true).single()
if(error||!data)return alert('Login inválido')
localStorage.setItem('barbearia_admin','SIM')
alternarPainel()
}
/*=========================================================
021 AGENDA SEMANAL
=========================================================*/
async function carregarAgendaSemanal(){
let hoje=new Date()
let inicio=new Date(hoje)
inicio.setDate(hoje.getDate()-hoje.getDay())
let fim=new Date(inicio)
fim.setDate(inicio.getDate()+6)
let dataInicio=inicio.toISOString().slice(0,10)
let dataFim=fim.toISOString().slice(0,10)
let {data=[]}=await client.from('agendamentos').select('*,clientes(nome),servicos(nome)').gte('data_agendamento',dataInicio).lte('data_agendamento',dataFim).order('data_agendamento').order('hora_solicitada')
renderCalendarioSemanal(data)
}
/*=========================================================
022 RENDER CALENDARIO SEMANAL
=========================================================*/
function renderCalendarioSemanal(lista){
let dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
let html='<div class="calendarioSemana">'
html+='<div class="calDia">Hora</div>'
for(let d=0;d<7;d++){
let base=new Date()
base.setDate(base.getDate()-base.getDay()+d)
html+=`<div class="calDia">${dias[d]}</div>`
}
for(let h=8;h<=20;h++){
let horarios=[]
if(h===8){
horarios.push('08:30')
}else if(h===20){
horarios.push('20:00')
}else{
horarios.push(`${String(h).padStart(2,'0')}:00`)
horarios.push(`${String(h).padStart(2,'0')}:30`)
}
for(let horario of horarios){
html+=`<div class="calHora">${horario}</div>`
for(let d=0;d<7;d++){
let base=new Date()
base.setDate(base.getDate()-base.getDay()+d)
let data=base.toISOString().slice(0,10)
let evento=lista.find(x=>x.data_agendamento===data&&String(x.hora_solicitada).slice(0,5)===horario)
html+=`<div class="calCelula">${evento?`<div class="calEvento">${evento.clientes?.nome||''}</div>`:''}</div>`
}
}
}
html+='</div>'
safe('calendarioSemanal').innerHTML=html
}
/*=========================================================
023 RECEPCAO
=========================================================*/
async function carregarRecepcao(){
let hoje=dataHoje()
let {data=[]}=await client.from('agendamentos').select('*,clientes(nome),servicos(duracao_minutos)').eq('data_agendamento',hoje).order('hora_solicitada')
let atendimento=data.find(x=>x.status==='em_atendimento')
let proximo=data.find(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo')
let fila=data.filter(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo').length
let tempo=0
data.filter(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo').forEach(x=>tempo+=Number(x.servicos?.duracao_minutos||0))
safe('recepcaoAtendimento').innerText=atendimento?.clientes?.nome||'-'
safe('recepcaoProximo').innerText=proximo?.clientes?.nome||'-'
safe('recepcaoFila').innerText=fila
safe('recepcaoTempo').innerText=tempo
}
