<?php

namespace Novosga\TriagemBundle\Controller;

use Exception;
use Novosga\Entity\Unidade;
use Novosga\Entity\Servico;
use Novosga\Entity\Atendimento;
use Novosga\Http\Envelope;
use Novosga\Service\AtendimentoService;
use Novosga\Service\ServicoService;
use Novosga\Util\Arrays;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Route;
use Sensio\Bundle\FrameworkExtraBundle\Configuration\Method;
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
        $unidade = $request->getSession()->get('unidade');
        
        $prioridades = $em->getRepository(\Novosga\Entity\Prioridade::class)->findAtivas();
        $servicos = $this->getServicoService()->servicosUnidade($unidade, 'e.status = 1');
        
        return $this->render('NovosgaTriagemBundle:Default:index.html.twig', [
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
        $service = $this->get('novosga.ticket_service');
        $html = $service->printTicket($atendimento);

        return new Response($html);
    }

    /**
     * @param Request $request
     * @return Response
     * 
     * @Route("/ajax_update", name="novosga_triagem_ajax_update")
     */
    public function ajaxUpdateAction(Request $request)
    {
        $em = $this->getDoctrine()->getManager();
        
        $envelope = new Envelope();
        $unidade = $request->getSession()->get('unidade');
        
        if ($unidade) {
            $ids = $request->get('ids');
            $ids = Arrays::valuesToInt(explode(',', $ids));
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

                $service = new AtendimentoService($em);

                $data = [
                    'ultima'   => $service->ultimaSenhaUnidade($unidade),
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
    public function servicoInfoAction(Request $request)
    {
        $em = $this->getDoctrine()->getManager();
        $unidade = $request->getSession()->get('unidade');
        
        $envelope = new Envelope();
        $id = (int) $request->get('id');
        try {
            $servico = $em->find(Servico::class, $id);
            if (!$servico) {
                throw new Exception(_('Serviço inválido'));
            }
            $data = [
                'nome' => $servico->getNome(),
                'descricao' => $servico->getDescricao()
            ];

            // ultima senha
            $service = new AtendimentoService($em);
            $atendimento = $service->ultimaSenhaServico($unidade, $servico);
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
        } catch (Exception $e) {
            $envelope->exception($e);
        }

        return $this->json($envelope);
    }

    /**
     * @param Request $request
     * @return Response
     * 
     * @Route("/distribui_senha", name="novosga_triagem_distribui_senha")
     * @Method("POST")
     */
    public function distribuiSenhaAction(Request $request)
    {
        $em = $this->getDoctrine()->getManager();
        
        $envelope = new Envelope();
        $unidade = $request->getSession()->get('unidade');
        $unidade = $em->getReference(Unidade::class, $unidade->getId());
        $usuario = $this->getUser();
        
        $servico = (int) $request->get('servico');
        $prioridade = (int) $request->get('prioridade');
        $nomeCliente = $request->get('cli_nome', '');
        $documentoCliente = $request->get('cli_doc', '');
        try {
            $service = new AtendimentoService($em);
            $data = $service->distribuiSenha($unidade, $usuario, $servico, $prioridade, $nomeCliente, $documentoCliente)->jsonSerialize();
            $envelope->setData($data);
        } catch (Exception $e) {
            $envelope->exception($e);
        }

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
    public function consultaSenhaAction(Request $request)
    {
        $em = $this->getDoctrine()->getManager();
        
        $envelope = new Envelope();
        $unidade = $request->getSession()->get('unidade');
        
        try {
            if (!$unidade) {
                throw new Exception(_('Nenhuma unidade selecionada'));
            }
            
            $numero = $request->get('numero');
            $service = new AtendimentoService($em);
            $atendimentos = $service->buscaAtendimentos($unidade, $numero);
            $envelope->setData($atendimentos);
        } catch (Exception $e) {
            $envelope->exception($e);
        }

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