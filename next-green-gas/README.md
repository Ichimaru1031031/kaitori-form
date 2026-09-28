# 買取レスキュー NEXT Green API

現行Blueとは完全に別のApps Scriptプロジェクトとしてデプロイするためのバックエンドです。

## 絶対条件
- 現行BlueのApps Scriptプロジェクト、Deployment ID、LINE Webhook/callbackは変更しない。
- このコードは新規Green専用Apps Scriptプロジェクトに配置する。
- データ保存先は `買取レスキュー NEXT データ` のみ。

## デプロイ
1. Google Apps Scriptで新規プロジェクトを作る。
2. `Code.gs` を貼り付け、`appsscript.json` を反映する。
3. ウェブアプリとして新規デプロイする。
4. 実行ユーザーは所有者。アクセス範囲は社内運用に合わせて設定する。
5. 発行された `/exec` URL を NEXT > その他 > Green共有API に保存する。
6. 「接続確認」で ping が成功することを確認する。
7. 同期待ちを送信してGreen側だけに保存されることを確認する。

## 実装済み操作
- `ping`
- `inventory-process-update`
- `inventory-test-add`
- `inventory-photo-add`
- `call-log`
- `visit-start`
- `finalize-slip`

## finalize-slip
- お客様署名をGreen署名フォルダへ保存
- 確定スナップショットを `NEXT_FINALIZED_SLIPS` へ保存
- 版付きPDFをGreen PDFフォルダへ生成
- `DOCUMENTS` にPDF履歴を追加
- 元Green伝票がある場合は確認済み状態を更新
- 過去版PDFは上書きしない

## 二重登録防止
すべての書き込みは `idempotencyKey` を必須とし、`IDEMPOTENCY` シートで重複処理を防止する。
