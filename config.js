window.BARBEARIA_CONFIG={
  nome:'Barbearia Leandro David',
  cidade:'Laguna/SC',
  endereco:'Rua Coronel Fernandes Martins, 251, em frente à UDESC, Laguna - SC',
  whatsapp:'5548996684751',
  instagram:'',
  intervalo:30,
  horariosSemana:{
    0:null,
    1:{inicio:'13:30',fim:'19:30'},
    2:{inicio:'09:00',fim:'19:30'},
    3:{inicio:'09:00',fim:'19:30'},
    4:{inicio:'09:00',fim:'19:30'},
    5:{inicio:'09:00',fim:'19:30'},
    6:{inicio:'09:00',fim:'17:30'}
  },
  bloqueiosPadrao:{
    1:[{inicio:'12:00',fim:'13:30',motivo:'Almoço'}],
    2:[{inicio:'12:00',fim:'13:30',motivo:'Almoço'}],
    3:[{inicio:'12:00',fim:'13:30',motivo:'Almoço'}],
    4:[{inicio:'12:00',fim:'13:30',motivo:'Almoço'}],
    5:[{inicio:'12:00',fim:'13:30',motivo:'Almoço'}],
    6:[]
  },
  supabaseUrl:'',
  supabasePublishableKey:'',
  servicosPadrao:[
    {id:'corte',nome:'Corte',duracao:30,valor:30},
    {id:'corte-navalhado',nome:'Corte navalhado',duracao:30,valor:35},
    {id:'barba',nome:'Barba',duracao:20,valor:20},
    {id:'cabelo-barba',nome:'Cabelo / barba',duracao:40,valor:40},
    {id:'sobrancelha',nome:'Sobrancelha',duracao:10,valor:10},
    {id:'combo',nome:'Cabelo / barba / sobrancelha',duracao:45,valor:50},
    {id:'pigmentacao-cabelo',nome:'Pigmentação cabelo',duracao:25,valor:20},
    {id:'pigmentacao-barba',nome:'Pigmentação barba',duracao:25,valor:15}
  ],
  planosMensais:[
    {id:'mensal-cabelo',nome:'Mensalista • Cabelo',valor:100},
    {id:'mensal-cabelo-barba',nome:'Mensalista • Cabelo e barba',valor:130}
  ],
  barbeirosPadrao:[
    {id:'leandro-david',nome:'Leandro David'}
  ]
};
