import { useWeb3React } from '@web3-react/core'
import debounce from 'lodash.debounce'
import { useRouter } from 'next/router'
import { useTranslations } from 'next-intl'
import { useCallback, useContext, useEffect, useState } from 'react'
import watchAsset from 'wallet-watch-asset'

import Button from '../../components/Button'
import PureContext from '../../components/context/Pure'
import Input from '../../components/Input'
import Layout from '../../components/Layout'
import UtilFormBox from '../../components/UtilFormBox'
import { fromUnit, toFixed } from '../../utils'

function MerkleClaims() {
  const t = useTranslations()
  const { active, account } = useWeb3React()
  const { query } = useRouter()
  const [claimID, setClaimID] = useState('')
  const [claimInProgress, setClaimInProgress] = useState(false)
  const [holding, setHolding] = useState({ amount: '', isClaimable: false })
  const [feedback, setFeedback] = useState({ color: 'text-black', message: '' })
  const { merkle } = useContext(PureContext)

  const clearFeedback = () => setFeedback({ color: 'text-black', message: '' })
  const setErrorMessage = message =>
    setFeedback({ color: 'text-red-600', message })
  const setInfoMessage = message =>
    setFeedback({ color: 'text-black', message })
  const setSuccessMessage = message =>
    setFeedback({ color: 'text-green-600', message })

  const getHolding = cID =>
    cID &&
    merkle.getHolding &&
    merkle
      .getHolding(cID)
      .then(function (h) {
        if (h.isClaimable) {
          clearFeedback()
        } else {
          setErrorMessage(t('already-claimed'))
        }
        setHolding(h)
      })
      .catch(e => setErrorMessage(e.message))

  const delayedClaimID = useCallback(
    debounce(cID => getHolding(cID), 500),
    [merkle]
  )

  const handleClaimIDChange = useCallback(
    function (e) {
      const re = /^[0-9\b]+$/
      if (e.target.value === '' || re.test(e.target.value)) {
        clearFeedback()
        setClaimID(e.target.value)
        delayedClaimID(e.target.value)
      }
    },
    [delayedClaimID]
  )

  const handleClaimSubmit = function () {
    setClaimInProgress(true)
    setInfoMessage(t('claim-in-progress'))
    return merkle
      .claim(claimID, holding.amount, holding.proof)
      .then(function () {
        setSuccessMessage(t('claim-succeeded'))
        setClaimID('')
      })
      .catch(e => setErrorMessage(e.message))
      .finally(() => setClaimInProgress(false))
      .then(() => watchAsset({ account, token: holding.token }))
  }

  useEffect(
    function () {
      clearFeedback()
      setClaimID('')
    },
    [active, account]
  )

  useEffect(() => setHolding({ amount: '', isClaimable: false }), [claimID])

  useEffect(
    function setClaimIdFromQueryOnLoad() {
      handleClaimIDChange({ target: { value: query.id } })
    },
    [handleClaimIDChange, merkle, query]
  )

  return (
    <Layout title={t('merkle-claims')} walletConnection>
      <UtilFormBox title={t('merkle-claims')}>
        <Input
          disabled={!active || claimInProgress}
          onChange={handleClaimIDChange}
          placeholder={t('enter-claim-id')}
          title={t('claim-id')}
          value={claimID}
        />
        <Input
          className="mb-8"
          disabled
          placeholder="0.0"
          suffix={holding && holding.token && holding.token.symbol}
          title={t('balance')}
          value={
            holding.amount &&
            toFixed(fromUnit(holding.amount, holding.token.decimals), 6)
          }
        />
        {/* TODO disable the button if not claimable! */}
        <Button className="flex justify-center" onClick={handleClaimSubmit}>
          {t('claim')}
        </Button>
        {feedback.message && (
          <p className={`text-center text-sm mt-6 ${feedback.color}`}>
            {feedback.message}
          </p>
        )}
      </UtilFormBox>
    </Layout>
  )
}

export { getStaticProps, getStaticPaths } from '../../utils/staticProps'
export default MerkleClaims
