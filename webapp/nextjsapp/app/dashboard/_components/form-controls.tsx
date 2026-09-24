"use client";

import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { KeyboardEvent, ReactNode, useMemo, useState } from "react";

// 利用者の選択肢を表す型。ユーザーID、ログインID、表示名、メールアドレスを含む。
export type UserOption = {
  id: number;
  loginId: string;
  displayName: string;
  email: string;
};

// ドロップダウンのパラメータ
type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
};

// トグルスイッチのパラメータ
type ToggleSwitchProps = {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

// 許可された利用者の入力フィールドのパラメータ
type AllowedUsersInputProps = {
  id: string;
  label: string;
  users: UserOption[];
  selectedUserIds: number[];
  isLoading?: boolean;
  onChange: (userIds: number[]) => void;
};

/***
 * 選択欄コンポーネント
 * tailwindPLUSの
 * https://tailwindcss.com/plus/ui-blocks/application-ui/forms/select-menus
 * を参考に作成。
 */
export function SelectField({ id, label, value, disabled, required, onChange, children }: SelectFieldProps) {
  return <div>
        <label htmlFor={id} className="block text-sm/6 font-medium text-gray-900 dark:text-white">{label}</label>
        <div className="mt-2 grid grid-cols-1">
            <select
                id={id}
                value={value}
                disabled={disabled}
                required={required}
                onChange={(event) => onChange(event.target.value)}
                className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus-visible:outline-indigo-500"
            >
                {children}
            </select>
        <ChevronDownIcon aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400" />
        </div>
  </div>;
}

/***
 * 切り替えスイッチコンポーネント
 * tailwindPLUSの
 * https://tailwindcss.com/plus/ui-blocks/application-ui/forms/toggles
 * を参考に作成。
 */
export function ToggleSwitch({ id, label, checked, disabled, onChange }: ToggleSwitchProps) {
  return <div>
        <label htmlFor={id} className="block text-sm/6 font-medium text-gray-900 dark:text-white">{label}</label>
        <div className="mt-2 group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-indigo-500 dark:has-checked:bg-indigo-500">
            <span className="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5" />
            <input
                id={id}
                name={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                aria-label={label}
                className="absolute inset-0 size-full appearance-none rounded-full bg-transparent p-0 focus:outline-hidden disabled:cursor-not-allowed"
            />
        </div>
    </div>;
}

/***
 * 配信接続許可する利用者の入力欄
 * 利用規模が1000人程度までの想定で、簡易的に作成。超過する場合は、別の実装を検討する必要がある。
 *
 * 動作の流れ:
 * 1. 利用者はテキスト欄に「loginId1, loginId2」のようにカンマ区切りで入力する。
 * 2. Enter キー、カンマ「,」キー、または入力欄からフォーカスが外れた（blur）タイミングで、
 *    入力文字列をカンマで区切り、それぞれの loginId に対応するユーザーを探す。
 * 3. 見つかったユーザーの ID を既存の選択リストに追加し、上位コンポーネントへ通知する。
 * 4. 入力欄は空に戻る。
 * 5. すでに選択されたユーザーはタグとして表示され、削除ボタンで選択から外せる。
 *
 * 補足:
 * - users: 選択肢となる全利用者のリスト（loginId で検索できるようにしている）。
 * - selectedUserIds: すでに選択されているユーザーの ID 配列。
 * - isLoading: true の間は入力欄を無効化し、「読み込み中…」と表示する。
 */
export function AllowedUsersInput({ id, label, users, selectedUserIds, isLoading, onChange }: AllowedUsersInputProps) {
  // ユーザーが現在入力中のテキストを保持する state。
  const [draft, setDraft] = useState("");

  // users 配列から「ユーザーID → ユーザー情報」の Map を作る。
  // これにより、selectedUserIds から表示名を素早く引けるようになる。
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  // users 配列から「ログインID → ユーザー情報」の Map を作る。
  // 入力欄に loginId が入力されたとき、対応するユーザーを探すために使う。
  // もし loginId が重複していれば、後から来るユーザーで上書きされるので、
  // API/DB 側で loginId が一意であることを保証しておくと安全。
  const usersByLoginId = useMemo(() => new Map(users.map((user) => [user.loginId, user])), [users]);

  // 選択中のユーザーID一覧を「ユーザー情報付きのオブジェクト配列」に変換する。
  // ユーザー情報が見つからない場合（たとえば削除済み）は user が undefined になる。
  const selectedUsers = selectedUserIds.map((userId) => ({ userId, user: usersById.get(userId) }));

  // datalist 要素の id。input 要素の list 属性と紐づけることで、
  // ブラウザが入力候補をドロップダウン表示してくれる。
  const datalistId = `${id}-options`;

  // 入力された文字列をカンマで区切り、各 loginId に対応するユーザーを探して追加する。
  // 該当しない文字列は無視される。
  function addUsersByLoginId(text: string) {
    const nextUserIds = text
      .split(",")
      .map((item) => usersByLoginId.get(item.trim())?.id)
      .filter((userId): userId is number => Number.isInteger(userId));

    // 追加すべきユーザーがいなければ何もしない。
    if (nextUserIds.length === 0) return;

    // 既存の selectedUserIds と新しい nextUserIds を合体させ、
    // Set を使って重複を排除してから配列に戻す。
    onChange([...new Set([...selectedUserIds, ...nextUserIds])]);

    // 入力欄をクリアして、次の入力に備える。
    setDraft("");
  }

  // 指定した userId を選択リストから外す。
  function removeUserId(userId: number) {
    onChange(selectedUserIds.filter((selectedUserId) => selectedUserId !== userId));
  }

  // キー入力を監視し、Enter またはカンマが押されたら確定処理を行う。
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;

    event.preventDefault();
    addUsersByLoginId(draft);
  }

  return <div>
    <label htmlFor={id} className="block text-sm/6 font-medium text-gray-900 dark:text-white">{label}</label>
    <div className="mt-2 space-y-3">
      {/* 選択済みのユーザーがあればタグ一覧を表示する。 */}
      {selectedUsers.length > 0 && <div className="flex flex-wrap gap-2">
        {selectedUsers.map(({ userId, user }) => <span key={userId} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20">
          {user ? user.displayName : userId}
          {/* type="button" を指定しておくことで、クリック時にフォームが送信されないようにする。 */}
          <button type="button" onClick={() => removeUserId(userId)} className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200" aria-label={`${user ? user.displayName : userId} を削除`} title="削除"><XMarkIcon className="size-4" /></button>
        </span>)}
      </div>}
      {/* ユーザー入力欄。datalist と組み合わせて入力候補を提示する。 */}
      <input
        id={id}
        list={datalistId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => addUsersByLoginId(draft)}
        onKeyDown={handleKeyDown}
        disabled={isLoading || users.length === 0}
        placeholder={isLoading ? "読み込み中..." : "ログインIDをカンマ区切りで入力"}
        className="disabled:opacity-60"
      />
      {/* 入力候補のリスト。ブラウザが対応していればドロップダウン表示される。 */}
      <datalist id={datalistId}>
        {users.map((user) => <option key={user.id} value={user.loginId}>{user.displayName} / {user.email}</option>)}
      </datalist>
      {/* 追加可能なユーザーがいない場合にメッセージを表示する。 */}
      {users.length === 0 && !isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">追加できる利用者がいません。</p>}
    </div>
  </div>;
}