<?php

/*
 * This file is part of the Novo SGA project.
 *
 * (c) Rogerio Lino <rogeriolino@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Novosga\TriagemBundle\Controller;

use Exception;
use Novosga\Entity\Atendimento;
use Novosga\Entity\Cliente;
use Novosga\Entity\Prioridade;
use Novosga\Entity\Servico;
use Novosga\Http\Envelope;
use Novosga\Service\AtendimentoService;
use Novosga\Service\ServicoService;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Method;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Route;
use Symfony\Bundle\FrameworkBundle\Controller\Controller;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * DefaultController
 *
 * @author Rogerio Lino <rogeriolino@gmail.com>
 */
class DefaultController extends Controller
{
    
    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/", name="novosga_triagem_index")
     */
    public function indexAction(Request $request)
    {
        $em = $this->getDoctrine()->getManager();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        $prioridades = $em->getRepository(Prioridade::class)->findAtivas();
        $servicos = $this->getServicoService()->servicosUnidade($unidade, 'e.ativo = TRUE');
        
        return $this->render('@NovosgaTriagem/default/index.html.twig', [
            'unidade' => $unidade,
            'servicos' => $servicos,
            'prioridades' => $prioridades,
        ]);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/imprimir/{id}", name="novosga_triagem_print")
     */
    public function imprimirAction(Request $request, Atendimento $atendimento)
    {
        $service = $this->get('App\Service\TicketService');
        $html = $service->printTicket($atendimento);

        return new Response($html);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/ajax_update", name="novosga_triagem_ajax_update")
     */
    public function ajaxUpdateAction(Request $request, AtendimentoService $atendimentoService)
    {
        $em = $this->getDoctrine()->getManager();
        
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        if ($unidade) {
            $ids = explode(',', $request->get('ids'));
            $senhas = [];
            if (count($ids)) {
                $dql = "
                    SELECT
                        s.id, COUNT(e) as total
                    FROM
                        Novosga\Entity\Atendimento e
                        JOIN e.servico s
                    WHERE
                        e.unidade = :unidade AND
                        e.servico IN (:servicos)
                ";
                // total senhas do servico (qualquer status)
                $rs = $em
                        ->createQuery($dql.' GROUP BY s.id')
                        ->setParameter('unidade', $unidade)
                        ->setParameter('servicos', $ids)
                        ->getArrayResult();
                foreach ($rs as $r) {
                    $senhas[$r['id']] = ['total' => $r['total'], 'fila' => 0];
                }
                // total senhas esperando
                $rs = $em
                        ->createQuery($dql.' AND e.status = :status GROUP BY s.id')
                        ->setParameter('unidade', $unidade)
                        ->setParameter('servicos', $ids)
                        ->setParameter('status', AtendimentoService::SENHA_EMITIDA)
                        ->getArrayResult();
                foreach ($rs as $r) {
                    $senhas[$r['id']]['fila'] = $r['total'];
                }

                $data = [
                    'ultima'   => $atendimentoService->ultimaSenhaUnidade($unidade),
                    'servicos' => $senhas,
                ];
                
                $envelope->setData($data);
            }
        }

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/servico_info", name="novosga_triagem_servico_info")
     */
    public function servicoInfoAction(Request $request, AtendimentoService $atendimentoService)
    {
        $em = $this->getDoctrine()->getManager();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        $envelope = new Envelope();
        $id = (int) $request->get('id');
        
        $servico = $em->find(Servico::class, $id);
        if (!$servico) {
            throw new Exception(_('Serviço inválido'));
        }
        $data = [
            'nome' => $servico->getNome(),
            'descricao' => $servico->getDescricao()
        ];

        // ultima senha
        $atendimento = $atendimentoService->ultimaSenhaServico($unidade, $servico);
        
        if ($atendimento) {
            $data['senha'] = $atendimento->getSenha()->__toString();
            $data['senhaId'] = $atendimento->getId();
        } else {
            $data['senha'] = '-';
            $data['senhaId'] = '';
        }
        // subservicos
        $data['subservicos'] = [];
        $subservicos = $em
                    ->createQueryBuilder()
                    ->select('e')
                    ->from(Servico::class, 'e')
                    ->where('e.mestre = :mestre')
                    ->orderBy('e.nome', 'ASC')
                    ->setParameter('mestre', $servico->getId())
                    ->getQuery()
                    ->getResult();

        foreach ($subservicos as $s) {
            $data['subservicos'][] = $s->getNome();
        }

        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     *
     * @Route("/distribui_senha", name="novosga_triagem_distribui_senha")
     * @Method("POST")
     */
    public function distribuiSenhaAction(Request $request, AtendimentoService $atendimentoService)
    {
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        $servico    = (int) $request->get('servico');
        $prioridade = (int) $request->get('prioridade');
        $cli        = $request->get('cliente', []) ?? [];
        $nome       = $cli['nome'] ?? '';
        $documento  = $cli['documento'] ?? '';
        
        $cliente = new Cliente();
        $cliente->setNome($nome);
        $cliente->setDocumento($documento);
        
        $data = $atendimentoService->distribuiSenha($unidade, $usuario, $servico, $prioridade, $cliente);
        $envelope->setData($data);

        return $this->json($envelope);
    }

    /**
     * Busca os atendimentos a partir do número da senha.
     *
     * @param Request $request
     * @return Response
     *
     * @Route("/consulta_senha", name="novosga_triagem_consulta_senha")
     */
    public function consultaSenhaAction(Request $request, AtendimentoService $atendimentoService)
    {
        $envelope = new Envelope();
        $usuario = $this->getUser();
        $unidade = $usuario->getLotacao()->getUnidade();
        
        if (!$unidade) {
            throw new Exception(_('Nenhuma unidade selecionada'));
        }

        $numero = $request->get('numero');
        $atendimentos = $atendimentoService->buscaAtendimentos($unidade, $numero);
        $envelope->setData($atendimentos);

        return $this->json($envelope);
    }

    /**
     * Busca os clientes a partir do documento.
     *
     * @param Request $request
     * @return Response
     *
     * @Route("/clientes", name="novosga_triagem_clientes")
     */
    public function clientesAction(Request $request)
    {
        $envelope  = new Envelope();
        $documento = $request->get('q');
        $clientes  = $this
                ->getDoctrine()
                ->getManager()
                ->getRepository(\Novosga\Entity\Cliente::class)
                ->findByDocumento("{$documento}%");
        
        $envelope->setData($clientes);

        return $this->json($envelope);
    }

    /**
     * @return ServicoService
     */
    private function getServicoService()
    {
        $service = new ServicoService($this->getDoctrine()->getManager());

        return $service;
    }
}
