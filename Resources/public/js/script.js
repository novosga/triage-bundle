/**
 * Novo SGA - Triage
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
(function () {
    'use strict'
    
    var Impressao = {
        
        iframe: 'frame-impressao',
        
        url: function (atendimento) {
            return App.url('/novosga.triage/imprimir/') + atendimento.id +'?_' + (new Date()).getTime();
        },
        
        imprimir: function (atendimento) {
            var iframe = document.getElementById(this.iframe);
            if (iframe) {
                iframe.src = this.url(atendimento);
            }
        }
        
    };
    
    var app = new Vue({
        el: '#triagem',
        data: {
            servicoIds: [],
            timeoutId: null,
            servicos: (servicos || []),
            prioridades: (prioridades || []),
            unidade: (unidade || {}),
            cliente: {
                nome: '',
                documento: ''
            },
            ultimaSenha: null,
            servicoInfo: null,
            atendimento: null,
            pausado: false,
            totais: {},
            servico: 0,
            prioridade: 0,
            search: '',
            searchResult: [],
            config: {
                imppressao: true,
                servicosHabilitados: [],
            },
            clientes: [],
            agendamentos: [],
            servicoAgendamento: null
        },
        methods: {
            init: function () {
                var self = this;
                
                App.Websocket.connect();

                App.Websocket.on('new ticket', function () {
                    console.log('new ticket');
                    this.update();
                });

                App.Websocket.on('connect', function () {
                    App.Websocket.emit('register user', {
                        secret: wsSecret,
                        user: usuario.id,
                        unity: self.unidade.id
                    });
                });

                // ajax polling fallback
                App.Websocket.on('reconnect_failed', function () {
                    App.Websocket.connect();
                    console.log('ws timeout, ajax polling fallback');
                    self.update();
                });
                
                App.Websocket.on('register ok', function () {
                    console.log('registered!');
                });

                this.servicos.forEach(function (su) {
                    self.servicoIds.push(su.servico.id);
                });

                this.loadConfig();
                
                this.update();
            },
            
            update: function () {
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/ajax_update'),
                    data: {
                        ids: self.servicoIds.join(',')
                    },
                    success: function (response) {
                        self.totais = response.data.servicos;
                        self.ultimaSenha = response.data.ultima;
                    }
                });
            },

            print: function (atendimento) {
                if (this.config.imprimir) {
                    Impressao.imprimir(atendimento);
                }
            },

            reprint: function (atendimento) {
                Impressao.imprimir(atendimento);
            },

            showServicoInfo: function (servico) {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triage/servico_info'),
                    data: {
                        id: servico
                    },
                    success: function (response) {
                        self.servicoInfo = response.data;
                        $('#dialog-servico').modal('show');
                    }
                });
            },

            showPrioridades: function (servicoId) {
                if (this.prioridades.length === 1) {
                    // se so tiver uma prioridade, emite a senha direto
                    this.distribuiSenha(servicoId, this.prioridades[0].id);
                } else {
                    this.servico = servicoId;
                    $('#dialog-prioridade').modal('show');
                }
            },

            loadAgendamentos: function () {
                var self = this;
                self.agendamentos = [];
                
                if (!self.servicoAgendamento) {
                    return;
                }

                App.ajax({
                    url: App.url('/novosga.triage/agendamentos/') + self.servicoAgendamento,
                    success: function (response) {
                        self.agendamentos = response.data;
                    }
                });
            },
            
            agendamentoConfirm: function (agendamento) {
                var self = this;
                
                App.ajax({
                    url: App.url('/novosga.triage/distribui_agendamento/') + agendamento.id,
                    type: 'post',
                    success: function (response) {
                        self.atendimento = response.data;
                        self.print(self.atendimento);

                        $('#dialog-senha').modal('show');

                        App.Websocket.emit('new ticket', {
                            unity: self.unidade.id
                        });
                    },
                    complete: function () {
                        self.pausado = false;
                        self.servicoAgendamento = null;
                        self.loadAgendamentos();
                        $('#dialog-agendamentos').modal('hide');
                    }
                });
            },

            distribuiSenhaNormal: function (servico) {
                this.distribuiSenha(servico, 1);
            },

            distribuiSenhaPrioritaria: function () {
                if (!this.prioridade || !this.servico) {
                    return;
                }

                this.distribuiSenha(this.servico, this.prioridade.id);

                $('#dialog-prioridade').modal('hide');
            },

            distribuiSenha: function (servico, prioridade) {
                var self = this;
                var defer = $.Deferred();

                if (!self.pausado) {
                    // evitando de gerar várias senhas com múltiplos cliques
                    self.pausado = true;

                    var data = {
                        servico: servico,
                        prioridade: prioridade,
                        cliente: self.cliente,
                        unidade: self.unidade.id
                    };

                    App.ajax({
                        url: App.url('/novosga.triage/distribui_senha'),
                        type: 'post',
                        data: data,
                        success: function (response) {
                            self.atendimento = response.data;
                            self.print(self.atendimento);

                            $('#dialog-senha').modal('show');
                            
                            App.Websocket.emit('new ticket', {
                                unity: self.unidade.id
                            });

                            defer.resolve(self.atendimento);
                            self.cliente = {};
                            
                            self.update();
                        },
                        error: function () {
                            defer.reject();
                        },
                        complete: function () {
                            self.pausado = false;
                        }
                    });
                } else {
                    defer.reject();
                }

                return defer.promise();
            },

            consultar: function () {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triage/consulta_senha'),
                    data: {
                        numero: self.search
                    },
                    success: function (response) {
                        self.searchResult = response.data;
                    }
                });
            },
            
            saveConfig: function () {
                var ids = this.config.servicosHabilitados.map(function (servicoUnidade) {
                        return servicoUnidade.servico.id;
                    }),
                    config = {
                        servicos: ids,
                        imprimir: this.config.imprimir,
                    };
                App.Storage.set('novosga.triage', JSON.stringify(config));
            },
            
            loadConfig: function () {
                try {
                    var json = App.Storage.get('novosga.triage'),
                        config = JSON.parse(json);
                        
                    config.servicos = config.servicos || [];
                    
                    this.config.imprimir = !!config.imprimir;
                
                    this.config.servicosHabilitados = this.servicos.filter(function (servicoUnidade) {
                        for (var  i = 0; i < config.servicos.length; i++) {
                            if (servicoUnidade.servico.id === config.servicos[i]) {
                                return true;
                            }
                        }
                        return false;
                    });
                } catch (e) {
                    this.config.imprimir = true;
                    this.config.servicosHabilitados = this.servicos;
                }
            },
            
            fetchClients: _.debounce(function () {
                var self = this;
                App.ajax({
                    url: App.url('/novosga.triage/clientes'),
                    data: {
                        q: self.cliente.documento
                    },
                    success: function (response) {
                        self.clientes = response.data;
                    }
                })
            }, 250),
            
            changeClient: function () {
                this.cliente.nome = '';
                for (var i in this.clientes) {
                    var c = this.clientes[i];
                    if (c.documento === this.cliente.documento) {
                        this.cliente.nome = c.nome;
                        break;
                    }
                }
            }
        }
    });
    
    app.init();
})();
