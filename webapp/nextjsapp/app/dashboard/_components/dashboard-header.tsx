import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import {
  Bars3Icon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";

/***
 * ダッシュボードのタブ種。プロフィールと設定はメニューに格納されるため、タブとしては表示されない。
 */
type DashboardTab = "streaming" | "watch" | "admin" | "profile" | "settings";

type DashboardHeaderProps = {
  activeTab: DashboardTab;
  canViewAdmin: boolean;
  displayName: string;
  email: string;
  isLoggingOut: boolean;
  onSelectTab: (tab: DashboardTab) => void;
  onLogout: () => void;
};

const TAB_LABELS: Record<DashboardTab, string> = {
  streaming: "配信",
  watch: "視聴",
  admin: "管理",
  profile: "プロフィール",
  settings: "設定",
};

export function DashboardHeader({
  activeTab,
  canViewAdmin,
  displayName,
  email,
  isLoggingOut,
  onSelectTab,
  onLogout,
}: DashboardHeaderProps) {
  // 管理者権限がある場合は管理タブを表示する。
  const tabs: DashboardTab[] = canViewAdmin
    ? ["streaming", "watch", "admin"]
    : ["streaming", "watch"];

  return (
    <header>
      <Disclosure
        as="nav"
        className="relative bg-white shadow-sm dark:bg-gray-800/50 dark:shadow-none dark:after:pointer-events-none dark:after:absolute dark:after:inset-x-0 dark:after:bottom-0 dark:after:h-px dark:after:bg-white/10"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex shrink-0 items-center">
                <Image
                  alt="ImageFlux Live Streaming on さくらのクラウドロゴ"
                  src="/normal(color).svg"
                  width={365}
                  height={328}
                  className="h-8 w-auto"
                />
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {tabs.map((tab) => {
                  const selected = tab === activeTab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => onSelectTab(tab)}
                      className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${
                        selected
                          ? "border-indigo-600 text-gray-900 dark:border-indigo-500 dark:text-white"
                          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
                      }`}
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              {/* Profile dropdown */}
              <Menu as="div" className="relative ml-3">
                <MenuButton className="relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-500">
                  <span className="absolute -inset-1.5" />
                  <span className="sr-only">利用者メニュー</span>
                  <UserCircleIcon className="size-8 text-gray-400" />
                </MenuButton>

                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg outline outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
                >
                  <MenuItem>
                    <a
                      onClick={() => onSelectTab("profile")}
                      className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:outline-hidden dark:text-gray-300 dark:data-focus:bg-white/5"
                    >
                      プロフィール
                    </a>
                  </MenuItem>
                  <MenuItem>
                    <a
                      onClick={() => onSelectTab("settings")}
                      className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:outline-hidden dark:text-gray-300 dark:data-focus:bg-white/5"
                    >
                      設定
                    </a>
                  </MenuItem>
                  <MenuItem disabled={isLoggingOut}>
                    <a
                      onClick={onLogout}
                      className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:outline-hidden dark:text-gray-300 dark:data-focus:bg-white/5"
                    >
                      ログアウト
                    </a>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
            <div className="-mr-2 flex items-center sm:hidden">
              {/* Mobile menu button */}
              <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-2 focus:-outline-offset-1 focus:outline-indigo-600 dark:hover:bg-white/5 dark:hover:text-white dark:focus:outline-indigo-500">
                <span className="absolute -inset-0.5" />
                <span className="sr-only">メインメニュー</span>
                <Bars3Icon
                  aria-hidden="true"
                  className="block size-6 group-data-open:hidden"
                />
                <XMarkIcon
                  aria-hidden="true"
                  className="hidden size-6 group-data-open:block"
                />
              </DisclosureButton>
            </div>
          </div>
        </div>

        <DisclosurePanel className="sm:hidden">
          <div className="space-y-1 pt-2 pb-3">
            {tabs.map((tab) => {
              const selected = tab === activeTab;
              return (
                <DisclosureButton
                  key={tab}
                  as="button"
                  type="button"
                  onClick={() => onSelectTab(tab)}
                  className={`block border-l-4 py-2 pr-4 pl-3 text-base font-medium ${
                    selected
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-600/10 dark:text-indigo-400"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-300 dark:hover:border-white/20 dark:hover:bg-white/5 dark:hover:text-white"
                  }`}
                >
                  {TAB_LABELS[tab]}
                </DisclosureButton>
              );
            })}
          </div>
          <div className="border-t border-gray-200 pt-4 pb-3 dark:border-white/10">
            <div className="flex items-center px-4">
              <div className="shrink-0">
                <UserCircleIcon className="size-10 text-gray-400" />
              </div>
              <div className="ml-3">
                <div className="text-base font-medium text-gray-800 dark:text-white">
                  {displayName}
                </div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{email}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <DisclosureButton
                as="a"
                onClick={() => onSelectTab("profile")}
                className="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                プロフィール
              </DisclosureButton>
              <DisclosureButton
                as="a"
                onClick={() => onSelectTab("settings")}
                className="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                設定
              </DisclosureButton>
              <DisclosureButton
                as="a"
                onClick={onLogout}
                disabled={isLoggingOut}
                className="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                ログアウト
              </DisclosureButton>
            </div>
          </div>
        </DisclosurePanel>
      </Disclosure>
    </header>
  );
}

export type { DashboardTab };
