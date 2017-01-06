/**
 * Novo SGA - Triagem
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
(function() {
    'use strict'
    
    var Impressao = {
        
        iframe: 'frame-impressao',
        
        url: function(atendimento) {
            return App.url('/novosga.triagem/imprimir') + "?id=" + atendimento.id;
        },
        
        imprimir: function(atendimento) {
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
            unidade: unidade,
            cliente: {},
            ultimaSenha: null,
            servicoInfo: null,
            atendimento: null,
            imprimir: true,
            pausado: false,
            totais: {},
            servico: 0,
            prioridade: 0,
            search: '',
            searchResult: [],
            desabilitados: []
        },
        methods: {
            ajaxUpdate: function() {
                var self = this;
                clearTimeout(self.timeoutId);

                if (!App.paused) {

                    App.ajax({
                        url: App.url('/novosga.triagem/ajax_update'),
                        data: {
                            ids: self.servicoIds.join(',')
                        },
                        success: function (response) {
                            self.totais = response.data.servicos;
                            self.ultimaSenha = response.data.ultima;
                        },
                        complete: function () {
                            self.timeoutId = setTimeout(self.ajaxUpdate, App.updateInterval);
                        }
                    });
                } else {
                    self.timeoutId = setTimeout(self.ajaxUpdate, App.updateInterval);
                }
            },

            print: function(atendimento) {
                if (this.imprimir) {
                    Impressao.imprimir(atendimento);
                }
            },

            showServicoInfo: function(servico) {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triagem/servico_info'),
                    data: {
                        id: servico
                    },
                    success: function(response) {
                        self.servicoInfo = response.data;
                        $('#dialog-servico').modal('show');
                    }
                });
            },

            showPrioridades: function(servicoId) {
                if (this.prioridades.length === 1) {
                    // se so tiver uma prioridade, emite a senha direto
                    this.distribuiSenha(servicoId, this.prioridades[0]);
                } else {
                    this.servico = servicoId;
                    $('#dialog-prioridade').modal('show');
                }
            },

            distribuiSenhaNormal: function(servico) {
                this.distribuiSenha(servico, 1);
            },

            distribuiSenhaPrioritaria: function() {
                if (!this.prioridade || !this.servico) {
                    return;
                }

                this.distribuiSenha(this.servico, this.prioridade);

                $('#dialog-prioridade').modal('hide');
            },

            distribuiSenha: function(servico, prioridade) {
                var self = this;
                var defer = $.Deferred();

                if (!self.pausado) {
                    // evitando de gerar várias senhas com múltiplos cliques
                    self.pausado = true;

                    var data = {
                        servico: servico,
                        prioridade: prioridade,
                        cliente: self.cliente,
                        unidade: self.unidade
                    };

                    $.ajax({
                        url: App.url('/api/distribui'),
                        type: 'post',
                        data: JSON.stringify(data),
                        success: function(response) {
                            self.atendimento = response;
                            self.print(self.atendimento);

                            $('#dialog-senha').modal('show');

                            defer.resolve(self.atendimento);
                        }, 
                        error: function() {
                            defer.reject();
                        },
                        complete: function() {
                            self.pausado = false;
                        }
                    });
                } else {
                    defer.reject();
                }

                return defer.promise();
            },

            consultar: function() {
                var self = this;

                App.ajax({
                    url: App.url('/novosga.triagem/consulta_senha'),
                    data: {
                        numero: self.search
                    },
                    success: function(response) {
                        self.searchResult = response.data;
                    }
                });
            },

            init: function () {
                var self = this;
                //App.Websocket.connect();

                App.Websocket.on('new ticket', function () {
                    console.log('new ticket');
                });

                App.Websocket.on('connect', function () {
                    clearTimeout(self.timeoutId);
                });

                this.servicos.forEach(function (su) {
                    self.servicoIds.push(su.servico.id);
                });

                this.desabilitados = JSON.parse(App.Storage.get('novosga.triagem.desabilitados') || '[]');

                this.ajaxUpdate();
            }
        }
    });
    
    app.init();
})();