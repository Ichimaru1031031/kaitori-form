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


## Stripe Checkout

Apps Script の Script Properties に以下を設定します。

- `STRIPE_SECRET_KEY` — Stripe のシークレットキー。ブラウザ側には絶対に置かない。
- `SHOP_SUCCESS_URL` — 任意。未設定時は NEXT 販売ページの success URL を使用。
- `SHOP_CANCEL_URL` — 任意。未設定時は NEXT 販売ページの cancel URL を使用。

### 決済フロー
1. 公開中の EC 商品だけを Green 側で再検証。
2. 商品価格はクライアント値ではなく `EC_LISTINGS` / `INVENTORY` から取得。
3. Checkout Session 作成時に商品を30分間 `決済中` にして一覧から外す。
4. 支払完了確認後に在庫を `売約済み`、EC掲載を `非公開` に更新。
5. 未払いで期限切れの場合は、販売中在庫のみ `公開` へ戻す。
6. 店頭受取は `引渡し準備`、配送は `配送日時調整` を次アクションにする。

配送費は Green `SETTINGS` の
`shop.shipping.pickup`, `shop.shipping.nagareyama`, `shop.shipping.kashiwa`
から読みます。`shop.shipping.other=quote` はオンライン決済せず個別見積です。
