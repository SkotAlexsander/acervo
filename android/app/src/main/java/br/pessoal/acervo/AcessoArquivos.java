package br.pessoal.acervo;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte pra permissão "Acesso a todos os arquivos".
 *
 * Por que precisou de código nativo: desde o Android 11, essa permissão NÃO é
 * concedida por um diálogo. O app não tem como pedir — ele só pode LEVAR o
 * usuário à tela de configurações certa, e depois perguntar de novo se já foi
 * concedida.
 *
 * Sem isto, o Acervo abriria com o armazenamento vazio e pareceria quebrado.
 * O `@capacitor/filesystem` não expõe essa checagem, então são estas ~40 linhas.
 */
@CapacitorPlugin(name = "AcessoArquivos")
public class AcessoArquivos extends Plugin {

    /** true quando dá pra enxergar o armazenamento inteiro. */
    private boolean concedida() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        // Android 10 e anteriores usam a permissão clássica, que o Capacitor
        // já pede sozinho no primeiro acesso.
        return true;
    }

    @PluginMethod
    public void verificar(PluginCall call) {
        JSObject r = new JSObject();
        r.put("concedida", concedida());
        r.put("precisaConfiguracoes", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R);
        r.put("versaoAndroid", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirConfiguracoes(PluginCall call) {
        JSObject r = new JSObject();
        if (concedida()) {
            r.put("aberto", false);
            r.put("concedida", true);
            call.resolve(r);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            r.put("aberto", false);
            r.put("concedida", true);
            call.resolve(r);
            return;
        }

        boolean aberto = false;
        try {
            // Leva direto à chave DESTE app — um toque a menos que a lista geral.
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            aberto = true;
        } catch (Exception primeiraFalha) {
            try {
                // Alguns fabricantes não implementam a tela específica do app.
                // A lista geral existe em todos.
                Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                aberto = true;
            } catch (Exception segundaFalha) {
                try {
                    // Último recurso: a ficha do app. O usuário chega em
                    // Permissões a partir dali.
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    i.setData(Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                    aberto = true;
                } catch (Exception terceiraFalha) {
                    r.put("erro", terceiraFalha.getMessage());
                }
            }
        }
        r.put("aberto", aberto);
        r.put("concedida", false);
        call.resolve(r);
    }
}
