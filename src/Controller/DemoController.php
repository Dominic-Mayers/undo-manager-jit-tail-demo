<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;


final class DemoController extends AbstractController
{
    #[Route('/demo/undo-box', name: 'demo_undo_box')]
    public function undoBox(): Response
    {
        return $this->render('demo/undo_box.html.twig');
    }
}