'use client'
import { useEffect, useState, useCallback } from 'react'

export type PTABallot = {
  id: string
  title: string
  description: string | null
  options: string[]
  closing_at: string
  min_fee_percent: number
  status: 'draft' | 'active' | 'closed'
}

export type PTAVoteResult = {
  option: string
  count: number
  percent: number
}

type VoteState = 'idle' | 'loading' | 'voted' | 'error' | 'closed' | 'ineligible'

export function usePTAVoting(schoolId: string | null, token: string | null) {
  const [ballot, setBallot]       = useState<PTABallot | null>(null)
  const [hasVoted, setHasVoted]   = useState(false)
  const [choice, setChoice]       = useState<string | null>(null)
  const [results, setResults]     = useState<PTAVoteResult[] | null>(null)
  const [state, setState]         = useState<VoteState>('idle')
  const [error, setError]         = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const loadBallot = useCallback(async () => {
    if (!schoolId || !token) return
    setState('loading')
    try {
      const res  = await fetch(`/api/pta/ballots?schoolId=${schoolId}`, { headers })
      const json = await res.json()
      if (!res.ok || !json.ballot) { setState('idle'); return }

      setBallot(json.ballot as PTABallot)
      setHasVoted(json.hasVoted ?? false)
      setChoice(json.myChoice ?? null)
      setState(json.hasVoted ? 'voted' : json.ballot.status === 'closed' ? 'closed' : 'idle')
      if (json.results) setResults(json.results as PTAVoteResult[])
    } catch {
      setState('error')
      setError('Could not load ballot')
    }
  }, [schoolId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitVote = useCallback(async (voteChoice: string) => {
    if (!ballot || !token) return
    setState('loading')
    try {
      const res  = await fetch('/api/pta/vote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ballotId: ballot.id, voteChoice }),
      })
      const json = await res.json()
      if (!res.ok) {
        setState(res.status === 403 ? 'ineligible' : 'error')
        setError(json.error ?? 'Vote failed')
        return
      }
      setHasVoted(true)
      setChoice(voteChoice)
      setState('voted')
    } catch {
      setState('error')
      setError('Network error. Please try again.')
    }
  }, [ballot, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadBallot() }, [loadBallot])

  return { ballot, hasVoted, choice, results, state, error, submitVote, refresh: loadBallot }
}
