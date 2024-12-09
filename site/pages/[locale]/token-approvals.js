import Big from 'big.js'
import { useWeb3React } from '@web3-react/core'
import { useRouter } from 'next/router'
import { useTranslations } from 'next-intl'
import { useContext, useEffect, useState } from 'react'

import Button from '../../components/Button'
import PureContext from '../../components/context/Pure'
import Input from '../../components/Input'
import InputBalance from '../../components/InputBalance'
import ToolsLayout from '../../components/layout/ToolsLayout'
import UtilFormBox from '../../components/layout/UtilFormBox'
import { useFormButton } from '../../hooks/useFormButton'
import { useTokenInput } from '../../hooks/useTokenInput'
import { fromUnit, toUnit } from '../../utils'
import CallToAction from '../../components/CallToAction'

const decimalRegex = /^(([1-9][0-9]*)?[0-9](\.[0-9]*)?|\.[0-9]+)$/
const infiniteSymbol = '∞'

const isInfinite = function (allowance, token) {
  if (!allowance || !token) {
    return false
  }

  if (allowance === infiniteSymbol) {
    return true
  }

  if (decimalRegex.test(allowance)) {
    return new Big(allowance).gt(token.totalSupply)
  }

  return false
}

const useAllowanceInput = function (
  token,
  spender,
  allowance,
  setAllowance,
  setFeedback
) {
  const { account, active, chainId } = useWeb3React()
  const { tokenApprovals } = useContext(PureContext)
  const disabled = !token || !spender || !active || !tokenApprovals

  useEffect(
    function () {
      setAllowance('')
    },
    [active, token, spender]
  )

  useEffect(
    function () {
      if (disabled) {
        return
      }

      tokenApprovals
        .allowance(token.address, account, spender.address)
        .then(function (currentAllowance) {
          setAllowance(
            isInfinite(currentAllowance, token)
              ? infiniteSymbol
              : fromUnit(currentAllowance, token.decimals)
          )
        })
        .catch(function (err) {
          setFeedback('error', err.message)
        })
    },
    [token, spender, account, chainId]
  )

  const handleChange = function (e) {
    if (e.target.value === '' || decimalRegex.test(e.target.value)) {
      setAllowance(
        isInfinite(e.target.value, token) ? infiniteSymbol : e.target.value
      )
    }
  }

  return {
    disabled,
    onChange: handleChange,
    token: token && token.symbol,
    value: allowance
  }
}

const useFeedback = function () {
  const { account, active } = useWeb3React()

  const [feedback, _setFeedback] = useState({ message: '' })

  useEffect(
    function () {
      _setFeedback({ message: '' })
    },
    [account, active]
  )

  const setFeedback = function (type, message) {
    const colors = {
      error: 'text-red-600',
      success: 'text-green-600'
    }
    const color = colors[type] || 'text-black'
    _setFeedback({ color, message })
  }

  return [feedback, setFeedback]
}

const TokenApprovalsForm = function () {
  const t = useTranslations()
  const { tokenApprovals } = useContext(PureContext)
  const { query } = useRouter()

  const [token, setToken] = useState(null)
  const tokenInput = useTokenInput(query.token, setToken)

  const [spender, setSpender] = useState(null)
  const spenderInput = useTokenInput(query.spender, setSpender, true)

  const [allowance, setAllowance] = useState('')
  const [feedback, setFeedback] = useFeedback()

  const allowanceInput = useAllowanceInput(
    token,
    spender,
    allowance,
    setAllowance,
    setFeedback
  )

  // Depending on the progress state of the approval operation, set the feedback
  // color and message.
  const onProgress = function (err, state) {
    if (err) {
      setFeedback('error', err.message)
      return
    }

    const messages = {
      info: t('approval-in-progress'),
      success: t('approval-succeeded')
    }
    setFeedback(state, messages[state])
  }

  // Set the approval buttons behavior, linking to the contract calls and
  // progress feedback.
  const approveDisabled = !allowance
  const approveButton = useFormButton(
    approveDisabled,
    () =>
      isInfinite(allowance, token)
        ? tokenApprovals.approveInfinite(token.address, spender.address)
        : tokenApprovals.approve(
            token.address,
            spender.address,
            toUnit(allowance, token.decimals)
          ),
    onProgress
  )

  return (
    <UtilFormBox
      text={t('utilities-text.token-approvals')}
      title={t('token-approvals')}
    >
      <Input
        placeholder={t('token-address-placeholder')}
        title={t('token-address')}
        {...tokenInput}
      />
      <Input
        placeholder={t('spender-address-placeholder')}
        title={t('spender-address')}
        {...spenderInput}
      />
      <InputBalance
        className="mb-4"
        suffix={token && token.symbol}
        title={t('allowance')}
        {...allowanceInput}
      />

      <div className="flex justify-end">
        <button
          disabled={approveDisabled}
          onClick={() => setAllowance(infiniteSymbol)}
          className={`${
            !approveDisabled
              ? 'text-orange-950 hover:text-orange-500 cursor-pointer'
              : 'text-orange-500 cursor-not-allowed'
          }`}
        >
          {t('allow-infinite')}
        </button>
      </div>

      <div className="mt-4">
        <CallToAction>
          <Button {...approveButton}>{t('approve-allowance')}</Button>
        </CallToAction>
      </div>

      {feedback.message && (
        <p className={`mt-6 text-center text-sm ${feedback.color}`}>
          {feedback.message}
        </p>
      )}
    </UtilFormBox>
  )
}

const TokenApprovals = function () {
  const t = useTranslations()
  const tHelperText = useTranslations('helper-text.token-approvals')

  const helperText = {
    title: tHelperText('title'),
    text: tHelperText('text'),
    questions: [
      {
        title: tHelperText('how-grant-question'),
        answer: tHelperText('how-grant-answer')
      },
      {
        title: tHelperText('fee-question'),
        answer: tHelperText('fee-answer')
      }
    ]
  }

  return (
    <ToolsLayout
      breadcrumb
      helperText={helperText}
      title={t('token-approvals')}
      walletConnection
    >
      <TokenApprovalsForm />
    </ToolsLayout>
  )
}

export { getStaticProps, getStaticPaths } from '../../utils/staticProps'
export default TokenApprovals
