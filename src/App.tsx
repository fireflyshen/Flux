import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { fetchDay, fetchMeta, fetchYear } from "./api";
import { DayDrawer } from "./components/DayDrawer";
import { DrawerShell } from "./components/DrawerShell";
import { Heatmap } from "./components/Heatmap";
import { PixelLoader } from "./components/PixelLoader";
import { ReportPanel } from "./components/ReportPanel";
import {
  accountBehaviorAmountOf,
  behaviorDetailAvailable,
  behaviorGrossAmountOf,
  formatMoney,
  isAccrualTransaction,
  medianDailySpend,
  quantileThresholds,
  type DaySpend,
  type YearSpend,
} from "./domain";

type Theme = "light" | "dark";
type View = "heatmap" | "report";

const THEME_OVERRIDE_KEY = "flux-theme-override";

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        stroke="none"
        d="M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z"
      />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V9M12 19V5M19 19v-7" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1.75v2.1M12 20.15v2.1M1.75 12h2.1M20.15 12h2.1M4.75 4.75l1.5 1.5M17.75 17.75l1.5 1.5M19.25 4.75l-1.5 1.5M6.25 17.75l-1.5 1.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.1 15.2A8.7 8.7 0 0 1 8.8 3.9 8.8 8.8 0 1 0 20.1 15.2Z" />
    </svg>
  );
}

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readThemeOverride(): Theme | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(THEME_OVERRIDE_KEY) || "null",
    ) as { date?: string; theme?: Theme } | null;
    const today = new Date().toISOString().slice(0, 10);
    return value?.date === today &&
      (value.theme === "light" || value.theme === "dark")
      ? value.theme
      : null;
  } catch {
    return null;
  }
}

function App() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [firstYear, setFirstYear] = useState(currentYear);
  const [view, setView] = useState<View>("heatmap");
  const [summary, setSummary] = useState<YearSpend | null>(null);
  const [currency, setCurrency] = useState("CNY");
  const [yearLoading, setYearLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DaySpend | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [selectedHeatmapAccount, setSelectedHeatmapAccount] = useState<
    string | null
  >(null);
  const [heatmapAccountPickerOpen, setHeatmapAccountPickerOpen] =
    useState(false);
  const [heatmapAccountPickerClosing, setHeatmapAccountPickerClosing] =
    useState(false);
  const [heatmapAccountQuery, setHeatmapAccountQuery] = useState("");
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const [themeOverride, setThemeOverride] = useState<Theme | null>(
    readThemeOverride,
  );
  const dayRequestId = useRef(0);
  const theme = themeOverride ?? systemTheme;

  const loadYear = useCallback(async (targetYear: number) => {
    setYearLoading(true);
    setPageError(null);
    try {
      const result = await fetchYear(targetYear);
      setSummary(result);
      setCurrency((current) =>
        result.currencies.includes(current)
          ? current
          : result.currencies.includes("CNY")
            ? "CNY"
            : (result.currencies[0] ?? current),
      );
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "无法读取 Bills 年度数据",
      );
    } finally {
      setYearLoading(false);
    }
  }, []);

  useEffect(() => {
    // The selected year is the external key for the read-only Bills summary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadYear(year);
  }, [loadYear, year]);
  useEffect(() => {
    void fetchMeta()
      .then((meta) => {
        setFirstYear(Math.min(currentYear, meta.firstYear));
        setCurrency((current) =>
          meta.currencies.includes(current)
            ? current
            : meta.currencies.includes("CNY")
              ? "CNY"
              : (meta.currencies[0] ?? current),
        );
      })
      .catch(() => undefined);
  }, [currentYear]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemTheme = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? "dark" : "light");
    preference.addEventListener("change", followSystemTheme);
    return () => preference.removeEventListener("change", followSystemTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(
      THEME_OVERRIDE_KEY,
      JSON.stringify({ date: today, theme: nextTheme }),
    );
    setThemeOverride(nextTheme);
  };

  const openDay = useCallback(async (date: string) => {
    const requestId = ++dayRequestId.current;
    setSelectedDate(date);
    setDay(null);
    setDayLoading(true);
    setDayError(null);
    try {
      const loadedDay = await fetchDay(date);
      if (dayRequestId.current === requestId) setDay(loadedDay);
    } catch (error) {
      if (dayRequestId.current === requestId)
        setDayError(
          error instanceof Error ? error.message : "无法读取当天支出",
        );
    } finally {
      if (dayRequestId.current === requestId) setDayLoading(false);
    }
  }, []);

  const closeDay = useCallback(() => {
    dayRequestId.current += 1;
    setSelectedDate(null);
    setDay(null);
    setDayLoading(false);
    setDayError(null);
  }, []);

  const changeYear = (nextYear: number) => {
    if (nextYear < firstYear || nextYear > currentYear) return;
    dayRequestId.current += 1;
    setYear(nextYear);
    setSelectedDate(null);
    setDay(null);
  };

  const heatmapAccounts = useMemo(() => {
    const accounts = new Map<
      string,
      { account: string; name: string; value: number }
    >();
    for (const item of summary?.days ?? []) {
      for (const transaction of item.transactions) {
        if (isAccrualTransaction(transaction)) continue;
        for (const category of transaction.categories) {
          if (category.currency !== currency) continue;
          const value = Number(category.gross);
          if (value === 0) continue;
          const row = accounts.get(category.account) ?? {
            account: category.account,
            name: category.name,
            value: 0,
          };
          row.value += value;
          accounts.set(category.account, row);
        }
      }
    }
    return [...accounts.values()]
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [currency, summary]);
  const activeHeatmapAccount =
    heatmapAccounts.find((row) => row.account === selectedHeatmapAccount) ??
    null;
  const heatmapAccount = activeHeatmapAccount?.account ?? null;
  const heatmapAccountName = activeHeatmapAccount?.name ?? "全部账户";
  const filteredHeatmapAccounts = useMemo(() => {
    const query = heatmapAccountQuery.trim().toLocaleLowerCase();
    if (!query) return heatmapAccounts;
    return heatmapAccounts.filter(
      (row) =>
        row.name.toLocaleLowerCase().includes(query) ||
        row.account.toLocaleLowerCase().includes(query),
    );
  }, [heatmapAccountQuery, heatmapAccounts]);
  const heatmapAmountOf = useCallback(
    (item: DaySpend | undefined, selectedCurrency: string) =>
      heatmapAccount
        ? accountBehaviorAmountOf(item, heatmapAccount, selectedCurrency)
        : behaviorGrossAmountOf(item, selectedCurrency),
    [heatmapAccount],
  );
  const behaviorAvailable = useMemo(
    () =>
      summary?.days.every((item) => behaviorDetailAvailable(item, currency)) ??
      true,
    [currency, summary],
  );
  const thresholds = useMemo(
    () => quantileThresholds(summary?.days ?? [], currency, heatmapAmountOf),
    [currency, heatmapAmountOf, summary],
  );
  const highSpendDays = useMemo(
    () =>
      summary?.days.filter(
        (item) =>
          heatmapAmountOf(item, currency) > (thresholds[3] ?? 0) &&
          (thresholds[3] ?? 0) > 0,
      ).length ?? 0,
    [currency, heatmapAmountOf, summary, thresholds],
  );
  const spendDays = useMemo(
    () =>
      summary?.days.filter((item) => heatmapAmountOf(item, currency) > 0)
        .length ?? 0,
    [currency, heatmapAmountOf, summary],
  );
  const median = useMemo(
    () => medianDailySpend(summary?.days ?? [], currency, heatmapAmountOf),
    [currency, heatmapAmountOf, summary],
  );
  const panelLabel = `${year} 年 ${currency} ${view === "heatmap" ? "支出热力图" : "支出洞察"}`;

  return (
    <div className="app-shell">
      <main className="heatmap-page">
        <section className="practice-panel" aria-label={panelLabel}>
          <div className="panel-heading">
            <div className="year-heading">
              <h1>{year}</h1>
              <div className="year-controls" aria-label="切换年份">
                <button
                  type="button"
                  onClick={() => changeYear(year - 1)}
                  disabled={year <= firstYear}
                  aria-label="上一年"
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  onClick={() => changeYear(year + 1)}
                  disabled={year >= currentYear}
                  aria-label="下一年"
                >
                  <ArrowIcon direction="right" />
                </button>
              </div>
            </div>
            <div className="panel-actions">
              {summary && summary.currencies.length > 1 && (
                <label className="currency-picker">
                  <span className="sr-only">币种</span>
                  <select
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    {summary.currencies.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="view-controls" aria-label="切换视图">
                <button
                  type="button"
                  data-active={view === "heatmap" || undefined}
                  aria-pressed={view === "heatmap"}
                  onClick={() => setView("heatmap")}
                  aria-label="热力图"
                  title="热力图"
                >
                  <GridIcon />
                </button>
                <button
                  type="button"
                  data-active={view === "report" || undefined}
                  aria-pressed={view === "report"}
                  onClick={() => setView("report")}
                  aria-label="支出洞察"
                  title="支出洞察"
                >
                  <ReportIcon />
                </button>
              </div>
              <button
                className="theme-button"
                type="button"
                data-theme={theme}
                onClick={toggleTheme}
                aria-label={`切换到${theme === "dark" ? "浅色" : "深色"}主题`}
                title={`切换到${theme === "dark" ? "浅色" : "深色"}主题`}
              >
                {theme === "light" ? <MoonIcon /> : <SunIcon />}
              </button>
            </div>
          </div>

          {view === "heatmap" ? (
            <>
              <div
                className="heatmap-frame"
                data-loading={yearLoading || undefined}
              >
                {yearLoading && !summary ? (
                  <PixelLoader />
                ) : (
                  <Heatmap
                    year={year}
                    days={summary?.days ?? []}
                    currency={currency}
                    account={heatmapAccount}
                    accountName={heatmapAccountName}
                    selectedDate={selectedDate}
                    onSelect={(date) => void openDay(date)}
                  />
                )}
              </div>
              <div className="heatmap-meta">
                <div className="heatmap-meta-copy">
                  <button
                    className="heatmap-account-trigger"
                    type="button"
                    onClick={() => {
                      setHeatmapAccountQuery("");
                      setHeatmapAccountPickerClosing(false);
                      setHeatmapAccountPickerOpen(true);
                    }}
                    aria-haspopup="dialog"
                  >
                    <small>账户</small>
                    <strong>{heatmapAccountName}</strong>
                    <span aria-hidden="true">›</span>
                  </button>
                  <span className="heatmap-insight">
                    {!behaviorAvailable
                      ? "缺少交易明细，无法计算行为支出"
                      : spendDays > 0
                        ? `${spendDays} 个支出日 · ${highSpendDays} 个高支出日`
                        : heatmapAccount
                          ? `${heatmapAccountName}还没有 ${currency} 支出`
                          : `还没有 ${currency} 行为支出`}
                  </span>
                </div>
                <div
                  className="legend"
                  aria-label={`相对本年度${heatmapAccount ? heatmapAccountName : "日常行为"}毛支出`}
                >
                  <span>低</span>
                  {[-1, 0, 1, 2, 3, 4, 5].map((level) => (
                    <i key={level} data-level={level} />
                  ))}
                  <span>高</span>
                </div>
                {pageError && (
                  <button
                    className="sync-error"
                    type="button"
                    onClick={() => void loadYear(year)}
                    title={pageError}
                  >
                    读取失败 · 重试
                  </button>
                )}
              </div>
            </>
          ) : (
            <ReportPanel
              key={`${year}-${currency}`}
              year={year}
              report={summary}
              currency={currency}
              loading={yearLoading}
              error={pageError}
              onRetry={() => void loadYear(year)}
            />
          )}
        </section>
      </main>

      {selectedDate && (
        <DayDrawer
          key={`${selectedDate}-${currency}-${heatmapAccount ?? "all"}`}
          date={selectedDate}
          day={day}
          currency={currency}
          account={heatmapAccount}
          accountName={heatmapAccountName}
          median={median}
          loading={dayLoading}
          error={dayError}
          onClosed={closeDay}
        />
      )}

      {heatmapAccountPickerOpen && (
        <DrawerShell
          labelledBy="heatmap-account-picker-title"
          closeLabel="关闭账户选择"
          closeRequested={heatmapAccountPickerClosing}
          onClosed={() => {
            setHeatmapAccountPickerOpen(false);
            setHeatmapAccountPickerClosing(false);
          }}
        >
          <div className="drawer-content account-picker-content">
            <div className="page-heading account-picker-heading">
              <span className="eyebrow">支出热力图</span>
              <h2 id="heatmap-account-picker-title">选择账户</h2>
              <div className="page-meta">
                <span>
                  {year} 年 · {currency}
                </span>
              </div>
            </div>
            <label className="account-picker-search">
              <span className="sr-only">搜索账户</span>
              <input
                type="search"
                value={heatmapAccountQuery}
                onChange={(event) => setHeatmapAccountQuery(event.target.value)}
                placeholder="搜索账户"
                aria-label="搜索账户"
                autoFocus
              />
              <small>{filteredHeatmapAccounts.length}</small>
            </label>
            <div className="account-picker-list">
              {!heatmapAccountQuery.trim() && (
                <button
                  className="account-picker-row"
                  type="button"
                  data-active={!heatmapAccount || undefined}
                  aria-pressed={!heatmapAccount}
                  onClick={() => {
                    setSelectedHeatmapAccount(null);
                    setHeatmapAccountPickerClosing(true);
                  }}
                >
                  <i aria-hidden="true" />
                  <span>
                    <strong>全部账户</strong>
                    <small>查看完整行为支出</small>
                  </span>
                  <em>—</em>
                </button>
              )}
              {filteredHeatmapAccounts.map((row) => {
                const active = row.account === heatmapAccount;
                return (
                  <button
                    className="account-picker-row"
                    type="button"
                    key={row.account}
                    data-active={active || undefined}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedHeatmapAccount(row.account);
                      setHeatmapAccountPickerClosing(true);
                    }}
                  >
                    <i aria-hidden="true" />
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.account}</small>
                    </span>
                    <em>{formatMoney(row.value, currency)}</em>
                  </button>
                );
              })}
              {filteredHeatmapAccounts.length === 0 && (
                <p className="account-picker-empty">没有匹配的账户</p>
              )}
            </div>
          </div>
        </DrawerShell>
      )}
    </div>
  );
}

export default App;
