package br.pessoal.acervo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // O registro tem que vir ANTES do super: é ele que monta a ponte JS↔Java.
        registerPlugin(AcessoArquivos.class);
        super.onCreate(savedInstanceState);
    }
}
