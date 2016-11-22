(function() {
    'use strict'
    
    angular.module('triagem', [])
    .config(function($interpolateProvider){
        $interpolateProvider.startSymbol('[[').endSymbol(']]');
    })
    .controller('TriagemController', function($http, $timeout, $q) {
        var ctrl = this,
            servicoIds = [],
            timeoutId = null;

        ctrl.servicos = (servicos || []);
        ctrl.prioridades = (prioridades || []);
        ctrl.unidade = unidade;
        
        ctrl.cliente = {};
        ctrl.ultimaSenha = '';
        ctrl.servicoInfo = {},
        ctrl.totais = {};
        ctrl.atendimento = {};
        ctrl.servico = 0;
        ctrl.search = '';
        ctrl.searchResult = [];
        ctrl.desabilitados = JSON.parse(App.Storage.get('novosga.triagem.desabilitados') || '[]');
        
        
        ctrl.servicos.forEach(function (su) {
            servicoIds.push(su.servico.id);
        });
        
        ctrl.print = function(atendimento) {
            App.Triagem.Impressao.loadIframe(atendimento);
        };

        ctrl.ajaxUpdate = function() {
            $timeout.cancel(timeoutId);
            
            if (!App.paused) {
                
                var params = {
                    ids: servicoIds.join(',')
                };
                
                $http.get(App.url('/novosga.triagem/ajax_update'), { params: params })
                        .then(function (response) {
                            response = response.data;
                            
                            if (response.success) {
                                ctrl.totais = response.data.servicos;
                                ctrl.ultimaSenha = response.data.ultima;
                            }
                            
                            timeoutId = $timeout(ctrl.ajaxUpdate, App.updateInterval);
                        }, function () {
                            timeoutId = $timeout(ctrl.ajaxUpdate, App.updateInterval);
                        });
            } else {
                timeoutId = $timeout(ctrl.ajaxUpdate, App.updateInterval);
            }
        };

        ctrl.showServicoInfo = function(servico) {
            var params = {
                id: servico
            };

            $http
                .get(App.url('/novosga.triagem/servico_info'), { params: params })
                .then(function(response) {
                    ctrl.servicoInfo = response.data.data;
                    $('#dialog-servico').modal('show');
                });
        };
        
        ctrl.showPrioridades = function(servicoId) {
            if (ctrl.prioridades.length === 1) {
                // se so tiver uma prioridade, emite a senha direto
                ctrl.distribuiSenha(servicoId, ctrl.prioridades[0]);
            } else {
                ctrl.servico = servicoId;
                $('#dialog-prioridade').modal('show');
            }
        };
        
        ctrl.distribuiSenhaNormal = function(servico) {
            ctrl.distribuiSenha(servico, 1);
        };
        
        ctrl.distribuiSenhaPrioritaria = function() {
            if (!ctrl.prioridade || !ctrl.servico) {
                return;
            }
            
            ctrl.distribuiSenha(ctrl.servico, ctrl.prioridade);
            
            $('#dialog-prioridade').modal('hide');
        };
        
        ctrl.distribuiSenha = function(servico, prioridade) {
            var defer = $q.defer();
            
            if (!App.Triagem.pausado) {
                // evitando de gerar várias senhas com múltiplos cliques
                App.Triagem.pausado = true;
                
                var data = {
                    servico: servico,
                    prioridade: prioridade,
                    cliente: ctrl.cliente,
                    unidade: ctrl.unidade
                };
                
                $http.post(App.url('/api/distribui'), data)
                    .then(function(response) {
                        App.Triagem.pausado = false;
                
                        ctrl.atendimento = response.data;
                        
                        $('#dialog-senha').modal('show');
                
                        defer.resolve(ctrl.atendimento);
                    }, function() {
                        App.Triagem.pausado = false;
                        
                        defer.reject();
                    });
            } else {
                defer.reject();
            }
            
            return defer.promise;
        };
        
        ctrl.consultar = function() {
            var url = App.url('/novosga.triagem/consulta_senha'),
                params = {
                    numero: ctrl.search
                };
            
            $http.get(url, { params: params })
                .then(function(response) {
                    ctrl.searchResult = response.data.data;
                });
        };
        
        App.Websocket.connect();
        
        App.Websocket.on('new ticket', function () {
            console.log('new ticket');
        });
        
        App.Websocket.on('connect', function () {
            $timeout.cancel(timeoutId);
        });
        
        ctrl.ajaxUpdate();
    });

})();

/**
 * Novo SGA - Triagem
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
var SGA = SGA || {};

App.Triagem = {
    
    imprimir: false,
    pausado: false,
    
    Impressao: {
        
        iframe: 'frame-impressao',
        
        imprimir: function(atendimento) {
            if (App.Triagem.imprimir) {
                App.Triagem.Impressao.loadIframe(atendimento);
            }
        },
        
        url: function(atendimento) {
            return App.url('/novosga.triagem/imprimir') + "?id=" + atendimento.id;
        },
        
        loadIframe: function(atendimento) {
            var iframe = document.getElementById(App.Triagem.Impressao.iframe);
            if (iframe) {
                iframe.src = App.Triagem.Impressao.url(atendimento);
            }
        }
        
    }
    
};
