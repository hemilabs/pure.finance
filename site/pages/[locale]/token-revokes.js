import { useWeb3React } from '@web3-react/core'
import Big from 'big.js'
import createErc20 from 'erc-20-lib'
import { useTranslations } from 'next-intl'
import React, { useContext, useEffect, useState } from 'react'
import useSWR from 'swr'

import Button from '../../components/Button'
import PureContext from '../../components/context/Pure'
import { ExplorerLink } from '../../components/ExplorerLink'
import TableBox from '../../components/layout/TableBox'
import ToolsLayout from '../../components/layout/ToolsLayout'
import { fromUnit } from '../../utils'
import SvgContainer from '../../components/svg/SvgContainer'
import Wallet from '../../components/Wallet'
import { Link } from '../../navigation'

// Comes from doing web3.utils.sha3('Approval(address,address,uint256)')
const APPROVAL_TOPIC =
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
const BLOCK_NUMBER_WINDOW = 5000 // range of blocks to review logs information
const MIN_BLOCK_TO_SYNC = 200000 // Sep-07-2015 09:33:09 PM +UTC

const getPreviousFromBlock = (pivotBlock, chunkIndex, minBlock) =>
  Math.max(minBlock, pivotBlock - BLOCK_NUMBER_WINDOW * chunkIndex)

const useLastBlockNumber = function () {
  const { active, library, chainId } = useWeb3React()
  return useSWR(active ? [`lastBlockNumber-${chainId}`, chainId] : null, () =>
    library.eth.getBlockNumber()
  )
}

const parseLogs = logs =>
  logs.map(({ address, blockNumber, data, transactionHash, topics }) => ({
    address,
    allowance: data,
    blockNumber,
    spender: topics[2].replace(/0{24}/, ''),
    transactionHash
  }))

const SyncStatus = {
  Error: 0,
  Finished: 2,
  Syncing: 1
}

const getNewestApprovals = function ({ logs, tokenApprovals, library }) {
  const allCombinations = new Set([
    ...tokenApprovals.map(({ address, spender }) => `${address}-${spender}`),
    ...logs.map(({ address, spender }) => `${address}-${spender}`)
  ])
  return Array.from(allCombinations)
    .map(function (string) {
      const [address, spender] = string.split('-')
      const allOperations = tokenApprovals
        .filter(
          tokenApproval =>
            tokenApproval.spender === spender &&
            tokenApproval.address === address
        )
        .concat(
          logs.filter(log => log.spender === spender && log.address === address)
        )
        .sort((a, b) => b.blockNumber - a.blockNumber)

      const newestOperation = allOperations[0]
      if (library.utils.hexToNumberString(newestOperation.allowance) === '0') {
        return null
      }
      return newestOperation
    })
    .filter(Boolean) // remove empties
}

const DEFAULT_SYNC_BLOCK_STATE = {
  chunkIndex: 0,
  fromBlock: MIN_BLOCK_TO_SYNC,
  hasSyncToMinBlock: false,
  toBlock: undefined,
  tokenApprovals: []
}

function useTokenApprovals() {
  const { active, library, account, chainId } = useWeb3React()
  const [syncBlock, setSyncBlock] = useState(DEFAULT_SYNC_BLOCK_STATE)

  const [syncStatus, setSyncStatus] = useState(SyncStatus.Syncing)

  const { data: lastBlockNumber } = useLastBlockNumber()
  const localStorageKey =
    chainId && account ? `pf-token-revokes-${chainId}-${account}` : null

  // this effect takes care of loading the restore point of sync process
  // or setting the initial data if syncing for the first time
  useEffect(
    function () {
      if (!localStorageKey) {
        setSyncBlock(DEFAULT_SYNC_BLOCK_STATE)
        return
      }

      const storedItem = localStorage.getItem(localStorageKey)

      if (!storedItem) {
        setSyncBlock(DEFAULT_SYNC_BLOCK_STATE)
        return
      }

      const { toBlock, hasSyncToMinBlock, chunkIndex, tokenApprovals } =
        JSON.parse(storedItem)

      if (hasSyncToMinBlock) {
        setSyncBlock({
          // the previous value we've synced up to, is now the lower bound to review. The latest blockNumber will be the new toBlock
          chunkIndex: 0,
          fromBlock: toBlock + 1,
          hasSyncToMinBlock: false,
          toBlock: undefined,
          tokenApprovals
        })
        return
      }

      setSyncBlock(prev => ({
        ...prev,
        chunkIndex,
        toBlock,
        tokenApprovals
      }))
    },
    [localStorageKey, setSyncBlock]
  )

  // this effect takes care of syncing in chunks of ${BLOCK_NUMBER_WINDOW} size
  useEffect(
    function () {
      if (
        !localStorageKey ||
        !lastBlockNumber ||
        syncStatus !== SyncStatus.Syncing
      ) {
        return
      }

      const { fromBlock, toBlock, chunkIndex, hasSyncToMinBlock } = syncBlock

      const pivotBlock =
        hasSyncToMinBlock || !toBlock ? lastBlockNumber : toBlock
      const from = getPreviousFromBlock(pivotBlock, chunkIndex + 1, fromBlock)
      const to =
        getPreviousFromBlock(pivotBlock, chunkIndex, fromBlock) -
        (chunkIndex === 0 ? 0 : 1)
      if (to < from) {
        return
      }
      // eslint-disable-next-line no-console
      console.log(`syncing from blockNumber ${from} to blockNumber ${to}`)

      library.eth
        .getPastLogs({
          fromBlock: from,
          toBlock: to,
          topics: [
            APPROVAL_TOPIC,
            library.utils.padLeft(account?.toLowerCase(), 64)
          ]
        })
        .then(function (logs) {
          const newHasSyncToMinBlock = from <= fromBlock

          if (newHasSyncToMinBlock) {
            setSyncStatus(SyncStatus.Finished)
          }

          setSyncBlock(function (prev) {
            const newTokenApprovals = getNewestApprovals({
              library,
              logs: parseLogs(logs),
              tokenApprovals: prev.tokenApprovals
            })

            // sync to local storage
            localStorage.setItem(
              localStorageKey,
              JSON.stringify({
                chunkIndex: newHasSyncToMinBlock ? 0 : chunkIndex + 1,
                fromBlock: newHasSyncToMinBlock ? pivotBlock + 1 : fromBlock,
                hasSyncToMinBlock: newHasSyncToMinBlock,
                toBlock: pivotBlock,
                tokenApprovals: newTokenApprovals
              })
            )

            return {
              ...prev,
              chunkIndex: newHasSyncToMinBlock ? 0 : prev.chunkIndex + 1,
              fromBlock: newHasSyncToMinBlock ? pivotBlock + 1 : prev.fromBlock,
              hasSyncToMinBlock: newHasSyncToMinBlock,
              tokenApprovals: newTokenApprovals
            }
          })
        })
        .catch(function (err) {
          // eslint-disable-next-line no-console
          console.warn('Syncing failed:', err.message)
        })
    },
    [
      library,
      localStorageKey,
      account,
      syncBlock,
      setSyncBlock,
      setSyncStatus,
      lastBlockNumber,
      syncStatus
    ]
  )

  // this effect listens for new logs that take place while the user is syncing. This will make the ux smoother
  // though they won't be added to the sync process
  useEffect(
    function () {
      if (!active || !account) {
        return undefined
      }

      const subscription = library.eth.subscribe('logs', {
        topics: [
          APPROVAL_TOPIC,
          library.utils.padLeft(account.toLowerCase(), 64)
        ]
      })

      subscription.on('data', function (log) {
        setSyncBlock(prev => ({
          ...prev,
          tokenApprovals: getNewestApprovals({
            library,
            logs: parseLogs([log]),
            tokenApprovals: prev.tokenApprovals
          })
        }))
      })

      return function () {
        subscription.unsubscribe()
      }
    },
    [active, library, account, chainId, setSyncBlock]
  )

  return { ...syncBlock, setSyncStatus, syncStatus }
}

const useErc20Token = function (address) {
  const { account, active, library } = useWeb3React()
  return useSWR(active ? `${account}:${address}` : null, function () {
    const erc20Service = createErc20(library, address)
    return Promise.all([
      erc20Service.symbol(),
      erc20Service.decimals(),
      erc20Service.totalSupply(),
      erc20Service.balanceOf(account)
    ]).then(([symbol, decimals, totalSupply, balance]) => ({
      balance,
      decimals,
      symbol,
      totalSupply
    }))
  })
}

const formatter = new Intl.NumberFormat('default', {
  maximumFractionDigits: 9,
  minimumFractionDigits: 6
})

const Allowance = function ({ address, data }) {
  const { library } = useWeb3React()
  const t = useTranslations()

  const { data: token } = useErc20Token(address)

  if (!token) {
    return <span className="m-auto" />
  }
  const { decimals, totalSupply } = token
  const allowanceInWei = library.utils.hexToNumberString(data)
  const value = new Big(fromUnit(allowanceInWei, decimals)).toNumber()
  const isUnlimited = new Big(allowanceInWei).gt(totalSupply)
  return (
    <span
      className="m-auto w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
      title={formatter.format(value)}
    >
      {isUnlimited ? t('unlimited') : formatter.format(value)}
    </span>
  )
}

const Balance = function ({ address }) {
  const { data: token } = useErc20Token(address)
  if (!token) {
    return <span className="m-auto" />
  }
  const { decimals, balance } = token
  const color = balance === '0' ? 'text-gray-300' : ''
  return (
    <span className={color}>
      {formatter.format(new Big(fromUnit(balance, decimals)).toNumber())}
    </span>
  )
}

const Token = function ({ address }) {
  const { chainId } = useWeb3React()
  const { data: token } = useErc20Token(address)
  if (!token) {
    return <ExplorerLink address={address} chainId={chainId} />
  }
  const { symbol } = token
  return <ExplorerLink address={address} chainId={chainId} text={symbol} />
}

const Status = function ({ icon, message, children }) {
  return (
    <>
      <tr>
        <td colSpan={5} className="pb-6 pt-12 text-center">
          <div className="bg-grayscale-50 border-grayscale-300 m-auto flex h-8 w-8 items-center justify-center rounded-full border">
            <SvgContainer className="w-5 cursor-pointer" name={icon} />
          </div>
        </td>
      </tr>
      <tr>
        <td colSpan={5} className="text-center">
          <h3 className="text-grayscale-500">{message}</h3>
        </td>
      </tr>
      <tr>
        <td colSpan={5} className="pb-12 pt-4">
          <div className="flex items-center justify-center">{children}</div>
        </td>
      </tr>
    </>
  )
}

const TokenRevokes = function () {
  const { active } = useWeb3React()
  const { erc20 } = useContext(PureContext)
  const t = useTranslations()
  const tHelperText = useTranslations('helper-text.token-revokes')
  const [isRevoking, setIsRevoking] = useState(false)

  const { tokenApprovals, syncStatus, setSyncStatus } = useTokenApprovals()
  const helperText = {
    title: tHelperText('title'),
    text: tHelperText('text'),
    questions: [
      {
        title: tHelperText('why-review-question'),
        answer: tHelperText('why-review-answer')
      },
      {
        title: tHelperText('how-revoke-question'),
        answer: tHelperText('how-revoke-answer')
      },
      {
        title: tHelperText('fee-question'),
        answer: tHelperText('fee-answer')
      }
    ]
  }

  const handleRevoke = function (address, spender) {
    if (!active) {
      return
    }
    setIsRevoking(true)
    const erc20Service = erc20(address)
    erc20Service
      .revoke(spender)
      .then(() => setIsRevoking(false))
      .catch(() => setSyncStatus(SyncStatus.Error))
  }

  return (
    <ToolsLayout
      breadcrumb
      helperText={helperText}
      title={t('list-and-revoke-token-approvals')}
      walletConnection
    >
      <TableBox
        text={t('utilities-text.token-revokes')}
        title={t('list-and-revoke-token-approvals')}
        className="shadow-lg"
      >
        <div className="w-100 md:w-150 overflow-auto lg:w-full">
          <table className="w-150">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-slate-200 rounded-xl border text-left text-sm">
                <th className="w-10 px-2 py-4 font-medium">{t('token')}</th>
                <th className="w-14 font-medium">{t('allowance')}</th>
                <th className="w-14 font-medium">{t('balance')}</th>
                <th className="w-24 font-medium">{t('spender-address')}</th>
                <th className="w-10 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tokenApprovals.map(
                ({ address, allowance, transactionHash, spender }) => (
                  <tr className="border-b" key={transactionHash}>
                    <td className="px-2 py-4">
                      <Token address={address} />
                    </td>
                    <td>
                      <Allowance address={address} data={allowance} />
                    </td>
                    <td>
                      <Balance address={address} />
                    </td>
                    <td>
                      <Token address={spender} />
                    </td>
                    <td className="px-2 py-4">
                      <Button
                        disabled={!active}
                        onClick={() => handleRevoke(address, spender)}
                      >
                        {t('revoke')}
                      </Button>
                    </td>
                  </tr>
                )
              )}

              {!active && (
                <Status icon="exclamation" message={t('connect-to-sync')}>
                  <Wallet />
                </Status>
              )}

              {active && syncStatus === SyncStatus.Syncing && (
                <Status icon="loading" message={t('syncing-your-approvals')} />
              )}

              {active && isRevoking && (
                <Status icon="exclamation" message={t('revoking-approval')} />
              )}

              {syncStatus === SyncStatus.Error && (
                <Status icon="error" message={t('generic-error')} />
              )}

              {active &&
                tokenApprovals.length === 0 &&
                syncStatus === SyncStatus.Finished && (
                  <Status icon="exclamation" message={t('no-approvals')}>
                    <Link className="text-orange-hemi" href="/token-approvals">
                      {t('token-approvals')}
                    </Link>
                  </Status>
                )}
            </tbody>
          </table>
        </div>
      </TableBox>
    </ToolsLayout>
  )
}

export { getStaticProps, getStaticPaths } from '../../utils/staticProps'
export default TokenRevokes
